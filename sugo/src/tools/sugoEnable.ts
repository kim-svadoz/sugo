import { resolve } from "node:path";
import { z } from "zod";
import { setProjectDisabled, ToggleProjectError } from "../harness/toggle.js";

export const sugoEnableInputSchema = {
  projectPath: z.string().describe("다시 활성화할 프로젝트의 절대경로"),
};

const SugoEnableArgs = z.object(sugoEnableInputSchema);

export async function handleSugoEnable(rawArgs: unknown) {
  const args = SugoEnableArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);
  try {
    await setProjectDisabled(projectPath, false);
  } catch (err) {
    if (err instanceof ToggleProjectError) return errorResult(err.code, err.message);
    throw err;
  }
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, projectPath, disabled: false }, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
