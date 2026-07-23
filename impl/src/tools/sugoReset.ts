import { resolve } from "node:path";
import { z } from "zod";
import { resetProjectHarness, ResetProjectError } from "../harness/reset.js";

export const sugoResetInputSchema = {
  projectPath: z.string().describe("적용된 하네스를 초기화할 프로젝트의 절대경로"),
};

const SugoResetArgs = z.object(sugoResetInputSchema);

export async function handleSugoReset(rawArgs: unknown) {
  const args = SugoResetArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);
  try {
    const { backedUpTo } = await resetProjectHarness(projectPath);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, projectPath, backedUpTo }, null, 2) }] };
  } catch (err) {
    if (err instanceof ResetProjectError) return errorResult(err.code, err.message);
    throw err;
  }
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
