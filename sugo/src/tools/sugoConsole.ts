import { z } from "zod";
import { controlConsole, manageConsoleRuntime } from "../lifecycle/consoleOnDemand.js";

export const sugoConsoleInputSchema = {
  action: z.enum(["status", "start", "restart", "stop", "open", "runtime_status", "runtime_install", "runtime_update", "runtime_rollback"]).default("status").describe("Console 서버 또는 독립 runtime 관리 동작"),
  runtimePath: z.string().min(1).optional().describe("runtime_install에서 설치할 Console runtime 디렉터리"),
};

const SugoConsoleArgs = z.object(sugoConsoleInputSchema);

export async function handleSugoConsole(rawArgs: unknown) {
  const { action, runtimePath } = SugoConsoleArgs.parse(rawArgs ?? {});
  const result = action.startsWith("runtime_")
    ? await manageConsoleRuntime(action as Parameters<typeof manageConsoleRuntime>[0], runtimePath)
    : await controlConsole(action as Parameters<typeof controlConsole>[0]);
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
