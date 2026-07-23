import { resolve } from "node:path";
import { z } from "zod";
import { setProjectDisabled, ToggleProjectError } from "../harness/toggle.js";

export const sugoDisableInputSchema = {
  projectPath: z.string().describe("비활성 처리할 프로젝트의 절대경로"),
};

const SugoDisableArgs = z.object(sugoDisableInputSchema);

export async function handleSugoDisable(rawArgs: unknown) {
  const args = SugoDisableArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);
  try {
    await setProjectDisabled(projectPath, true);
  } catch (err) {
    if (err instanceof ToggleProjectError) return errorResult(err.code, err.message);
    throw err;
  }
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, projectPath, disabled: true }, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
