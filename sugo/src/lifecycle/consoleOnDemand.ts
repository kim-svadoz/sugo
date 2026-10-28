import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncAllWorkspaceData } from "../dashboard/syncAll.js";
import { currentSugoVersion } from "../version.js";
import { controlDashboard, type DashboardControlAction, type DashboardControlResult, type EnsureOptions } from "./dashboardRuntime.js";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Console은 세션마다 띄우지 않고 필요할 때만 띄운다: 사용자가 open·start를 실행할 때, 그리고 작업이 사람 판단을
 * 기다릴 때. 꺼져 있던 동안의 작업 기록은 로컬 파일이 정본이므로, 띄운 직후 전량 다시 맞춘다.
 */
export async function controlConsole(action: DashboardControlAction, options: Partial<EnsureOptions> = {}): Promise<DashboardControlResult> {
  const result = await controlDashboard(action, { pluginRoot, buildId: currentSugoVersion(), ...options });
  if (result.running && action !== "status" && action !== "stop") {
    await syncAllWorkspaceData().catch((error) => {
      console.error("[sugo] console sync failed:", error);
    });
  }
  return result;
}
