/**
 * Console 시작 진입점(빌드 시 dist/dashboard-start.mjs로 번들된다). 세션 시작 훅에서는 더 이상 부르지 않는다.
 * 설치본 검증(scripts/dashboard-e2e.mjs)이 이 파일로 Console을 띄우고 로컬 정본을 동기화한다.
 * 문제가 있을 때만 한 줄을 알리고, 항상 exit 0으로 끝난다.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentSugoVersion } from "../version.js";
import { syncAllWorkspaceData } from "../dashboard/syncAll.js";
import { ensureDashboard } from "./dashboardRuntime.js";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = await ensureDashboard({ pluginRoot, buildId: currentSugoVersion() });
if ("message" in result && result.message) console.log(JSON.stringify({ systemMessage: result.message }));
if (result.kind === "started" || result.kind === "running") {
  await syncAllWorkspaceData().catch((error) => {
    console.error("[sugo] dashboard startup sync failed:", error);
  });
}
process.exit(0);
