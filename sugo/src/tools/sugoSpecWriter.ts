import { readFile } from "node:fs/promises";
import { z } from "zod";
import { attachSpecDocument, fetchUnlinkedSpecDrafts } from "../dashboard/fetch.js";

export const sugoSpecWriterInputSchema = {
  action: z.enum(["context", "complete"]),
  workspace: z.string().min(1),
  specDraftId: z.string().min(1),
  projectPath: z.string().optional(),
  specPath: z.string().optional(),
  /** lint 경고를 사용자에게 보여주고 연결 승인을 받은 뒤에만 true로 다시 호출한다. */
  acceptLintWarnings: z.boolean().optional(),
};

const Args = z.object(sugoSpecWriterInputSchema);
// 문구만 보는 검사라 구현 세부·추정이 일반 문장으로 쓰이면 통과한다. 판단 오류까지 막지는 못한다.
const SPEC_LINT_RULES: { kind: string; pattern: RegExp }[] = [
  { kind: "implementation-path", pattern: /src\/(?:main|test)\// },
  { kind: "file-line", pattern: /\.(?:java|kt|py|ts):\d+/ },
  { kind: "line-number", pattern: /#L\d+|\blines?\s+\d+|\d+\s*번째\s*줄|\d+\s*행\b/i },
  { kind: "commit-hash", pattern: /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/ },
];

export function lintSpecText(text: string): { line: number; kind: string; match: string }[] {
  return text.split("\n").flatMap((content, index) =>
    SPEC_LINT_RULES.flatMap(({ kind, pattern }) => {
      const found = content.match(pattern);
      return found ? [{ line: index + 1, kind, match: found[0] }] : [];
    }),
  );
}

const result = (payload: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] });

export async function handleSugoSpecWriter(rawArgs: unknown) {
  const args = Args.parse(rawArgs);
  const candidates = await fetchUnlinkedSpecDrafts(args.workspace);
  if (!candidates) return result({ ok: false, errorCode: "DASHBOARD_UNAVAILABLE" });
  const spec = candidates.find((candidate) => candidate.id === args.specDraftId);
  if (!spec) return result({ ok: false, errorCode: "SPEC_NOT_EDITABLE", message: "SPEC이 없거나 feat 시작 후 잠겼습니다." });
  if (args.projectPath && spec.projectPath && args.projectPath !== spec.projectPath) {
    return result({ ok: false, errorCode: "PROJECT_MISMATCH", expected: spec.projectPath, received: args.projectPath });
  }
  if (args.action === "context") return result({ ok: true, spec });
  if (!args.specPath) return result({ ok: false, errorCode: "SPEC_PATH_REQUIRED" });
  const text = await readFile(args.specPath, "utf-8").catch(() => null);
  if (text === null) return result({ ok: false, errorCode: "SPEC_FILE_NOT_FOUND", specPath: args.specPath });
  const warnings = lintSpecText(text);
  if (warnings.length > 0 && !args.acceptLintWarnings) {
    return result({
      ok: false,
      errorCode: "SPEC_LINT_WARNINGS",
      message: "spec.md에 구현 경로·줄 번호·커밋 해시로 보이는 문구가 있습니다. 새 버전으로 고치거나, 사용자에게 보여주고 승인받은 뒤 acceptLintWarnings:true로 다시 호출하세요.",
      warnings,
    });
  }
  try {
    await attachSpecDocument(args.workspace, args.specDraftId, args.specPath);
    return result({ ok: true, specPath: args.specPath, next: "Schedule에서 feat 명령을 복사해 새 세션에서 실행하세요." });
  } catch (error) {
    return result({ ok: false, errorCode: "SPEC_ATTACH_FAILED", message: error instanceof Error ? error.message : String(error) });
  }
}
