/**
 * SessionStart 훅 진입점(빌드 시 dist/dashboard-start.mjs로 번들된다).
 * 문제가 있을 때만 사용자에게 한 줄을 알리고, 항상 exit 0으로 끝난다.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentSugoVersion } from "../version.js";
import { ensureDashboard } from "./dashboardRuntime.js";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = await ensureDashboard({ pluginRoot, buildId: currentSugoVersion() });
if ("message" in result && result.message) console.log(JSON.stringify({ systemMessage: result.message }));
process.exit(0);
