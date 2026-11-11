import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncAllWorkspaceData } from "../dashboard/syncAll.js";
import { controlDashboard, type DashboardControlAction, type DashboardControlResult, type EnsureOptions } from "./dashboardRuntime.js";
import { installConsoleRuntime, listInstalledConsoleRuntimes, resolveConsoleRuntime, rollbackConsoleRuntime, updateConsoleRuntime } from "./consoleRuntime.js";

export const consolePluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Console은 세션마다 띄우지 않고 필요할 때만 띄운다: 사용자가 open·start를 실행할 때, 그리고 작업이 사람 판단을
 * 기다릴 때. 꺼져 있던 동안의 작업 기록은 로컬 파일이 정본이므로, 띄운 직후 전량 다시 맞춘다.
 */
export async function controlConsole(action: DashboardControlAction, options: Partial<EnsureOptions> = {}): Promise<DashboardControlResult> {
  const result = await controlDashboard(action, { pluginRoot: consolePluginRoot, ...options });
  if (result.running && action !== "status" && action !== "stop") {
    await syncAllWorkspaceData().catch((error) => {
      console.error("[sugo] console sync failed:", error);
    });
  }
  return result;
}

export type ConsoleRuntimeAction = "runtime_status" | "runtime_install" | "runtime_update" | "runtime_rollback";

export async function manageConsoleRuntime(action: ConsoleRuntimeAction, runtimePath?: string) {
  const before = await controlDashboard("status", { pluginRoot: consolePluginRoot });
  const runtime = action === "runtime_install"
    ? runtimePath ? await installConsoleRuntime(runtimePath) : null
    : action === "runtime_update"
      ? await updateConsoleRuntime(consolePluginRoot)
      : action === "runtime_rollback"
        ? await rollbackConsoleRuntime()
        : resolveConsoleRuntime(consolePluginRoot);
  if (action !== "runtime_status" && !runtime) {
    return { ok: false, action, error: action === "runtime_install" && !runtimePath ? "RUNTIME_PATH_REQUIRED" : "CONSOLE_RUNTIME_NOT_AVAILABLE" };
  }
  const server = before.running && action !== "runtime_status"
    ? await controlDashboard("restart", { pluginRoot: consolePluginRoot })
    : before;
  return {
    ok: true,
    action,
    runtime,
    installed: listInstalledConsoleRuntimes().map(({ consoleVersion, source }) => ({ consoleVersion, source })),
    server,
  };
}
