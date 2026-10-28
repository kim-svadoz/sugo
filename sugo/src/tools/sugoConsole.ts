import { z } from "zod";
import { controlConsole } from "../lifecycle/consoleOnDemand.js";

export const sugoConsoleInputSchema = {
  action: z.enum(["status", "start", "restart", "stop", "open"]).default("status").describe("Console 서버 관리 동작"),
};

const SugoConsoleArgs = z.object(sugoConsoleInputSchema);

export async function handleSugoConsole(rawArgs: unknown) {
  const { action } = SugoConsoleArgs.parse(rawArgs ?? {});
  const result = await controlConsole(action);
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
