import { readFile } from "node:fs/promises";
import { z } from "zod";
import { attachSpecDocument, fetchUnlinkedSpecDrafts } from "../dashboard/fetch.js";

export const sugoSpecWriterInputSchema = {
  action: z.enum(["context", "complete"]),
  workspace: z.string().min(1),
  specDraftId: z.string().min(1),
  projectPath: z.string().optional(),
  specPath: z.string().optional(),
};

const Args = z.object(sugoSpecWriterInputSchema);
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
  const exists = await readFile(args.specPath, "utf-8").then(() => true, () => false);
  if (!exists) return result({ ok: false, errorCode: "SPEC_FILE_NOT_FOUND", specPath: args.specPath });
  try {
    await attachSpecDocument(args.workspace, args.specDraftId, args.specPath);
    return result({ ok: true, specPath: args.specPath, next: "Schedule에서 feat 명령을 복사해 새 세션에서 실행하세요." });
  } catch (error) {
    return result({ ok: false, errorCode: "SPEC_ATTACH_FAILED", message: error instanceof Error ? error.message : String(error) });
  }
}
