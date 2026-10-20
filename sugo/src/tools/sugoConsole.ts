import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { controlDashboard } from "../lifecycle/dashboardRuntime.js";
import { currentSugoVersion } from "../version.js";

export const sugoConsoleInputSchema = {
  action: z.enum(["status", "start", "restart", "stop"]).default("status").describe("Console 서버 관리 동작"),
};

const SugoConsoleArgs = z.object(sugoConsoleInputSchema);

export async function handleSugoConsole(rawArgs: unknown) {
  const { action } = SugoConsoleArgs.parse(rawArgs ?? {});
  const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await controlDashboard(action, { pluginRoot, buildId: currentSugoVersion() });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
