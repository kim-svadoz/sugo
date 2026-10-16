import { access, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { attachSpecDocument, downloadSpecAttachments, fetchSpecDraft, fetchUnlinkedSpecDrafts } from "../dashboard/fetch.js";
import { sugoHomeDir } from "../homeDir.js";
import { toNfc } from "../unicodeName.js";

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
const REQUIRED_SPEC_SECTIONS = ["배경/목적", "범위", "요구사항", "완료조건", "제약", "Open Questions", "Sources"] as const;

export function lintSpecText(text: string): { line: number; kind: string; match: string }[] {
  return text.split("\n").flatMap((content, index) =>
    SPEC_LINT_RULES.flatMap(({ kind, pattern }) => {
      const found = content.match(pattern);
      return found ? [{ line: index + 1, kind, match: found[0] }] : [];
    }),
  );
}

function validateSpecStructure(text: string): { missingSections: string[]; ordered: boolean } {
  const headings = text.split("\n")
    .map((line) => line.match(/^##\s+(.+?)\s*$/)?.[1])
    .filter((heading): heading is string => !!heading);
  const positions = REQUIRED_SPEC_SECTIONS.map((section) => headings.indexOf(section));
  return {
    missingSections: REQUIRED_SPEC_SECTIONS.filter((_, index) => positions[index] < 0),
    ordered: positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])),
  };
}

const result = (payload: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] });

function localDateKey(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function specSlug(title: string): string {
  return toNfc(title).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().replace(/\s+/g, "-") || "spec";
}

async function nextSpecTarget(title: string) {
  const date = localDateKey();
  const root = join(sugoHomeDir(), ".claude", "sugo", "specs");
  const featureDir = join(root, date, specSlug(title));
  let version = 1;
  while (await access(join(featureDir, `v${version}`)).then(() => true, () => false)) version += 1;
  const directory = join(featureDir, `v${version}`);
  return { root, date, version, directory, path: join(directory, "spec.md") };
}

function managedSpecPath(specPath: string): boolean {
  const root = resolve(sugoHomeDir(), ".claude", "sugo", "specs");
  const rel = relative(root, resolve(specPath));
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return false;
  const parts = rel.split(sep);
  return parts.length === 4 && /^\d{8}$/.test(parts[0]) && parts[1].length > 0 && /^v[1-9]\d*$/.test(parts[2]) && parts[3] === "spec.md";
}

export async function handleSugoSpecWriter(rawArgs: unknown) {
  const args = Args.parse(rawArgs);
  const candidates = await fetchUnlinkedSpecDrafts(args.workspace);
  if (!candidates) return result({ ok: false, errorCode: "DASHBOARD_UNAVAILABLE" });
  const spec = candidates.find((candidate) => candidate.id === args.specDraftId);
  if (!spec) return result({ ok: false, errorCode: "SPEC_NOT_EDITABLE", message: "SPEC이 없거나 feat 시작 후 잠겼습니다." });
  if (args.projectPath && spec.projectPath && args.projectPath !== spec.projectPath) {
    return result({ ok: false, errorCode: "PROJECT_MISMATCH", expected: spec.projectPath, received: args.projectPath });
  }
  if (args.action === "context") {
    const dir = join(sugoHomeDir(), ".claude", "sugo", "spec-attachments", encodeURIComponent(args.workspace), encodeURIComponent(spec.id));
    try {
      const [attachments, draftContent] = await Promise.all([
        downloadSpecAttachments(args.workspace, spec.id, dir),
        fetchSpecDraft(args.workspace, spec.id),
      ]);
      const specTarget = await nextSpecTarget(spec.title);
      return result({ ok: true, spec, specTarget, draftContent: draftContent ?? "", attachments: attachments ?? [], ...(attachments === null && { attachmentsUnavailable: true }) });
    } catch (error) {
      return result({ ok: false, errorCode: "SPEC_ATTACHMENT_DOWNLOAD_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!args.specPath) return result({ ok: false, errorCode: "SPEC_PATH_REQUIRED" });
  if (!managedSpecPath(args.specPath)) {
    return result({
      ok: false,
      errorCode: "SPEC_PATH_OUTSIDE_MANAGED_ROOT",
      message: "context 응답의 specTarget.path 아래에 작성한 spec.md만 연결할 수 있습니다.",
    });
  }
  const text = await readFile(args.specPath, "utf-8").catch(() => null);
  if (text === null) return result({ ok: false, errorCode: "SPEC_FILE_NOT_FOUND", specPath: args.specPath });
  const structure = validateSpecStructure(text);
  if (structure.missingSections.length > 0 || !structure.ordered) {
    return result({
      ok: false,
      errorCode: "SPEC_STRUCTURE_INVALID",
      message: "SPEC 필수 섹션이 빠졌거나 표준 순서와 다릅니다.",
      missingSections: structure.missingSections,
      requiredOrder: REQUIRED_SPEC_SECTIONS,
    });
  }
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
