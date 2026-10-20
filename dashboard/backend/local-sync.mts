/** 기존 ~/.claude/sugo 데이터를 실행 중인 로컬 Dashboard API로 전량 동기화한다. */
import { readFileSync } from "node:fs";
import { syncPluginVersion, syncUser } from "../../sugo/src/dashboard/sync.js";
import { syncAllWorkspaceData } from "../../sugo/src/dashboard/syncAll.js";

await syncUser();
// 이 스크립트는 번들 밖(tsx)에서 실행되므로 __SUGO_VERSION__이 없고 version.ts의
// 개발 폴백(0.0.0-dev)이 나온다. 실제 설치 소스의 package.json을 진실로 사용한다.
const pluginVersion = (JSON.parse(readFileSync(new URL("../../sugo/package.json", import.meta.url), "utf8")) as { version: string }).version;
await syncPluginVersion(pluginVersion);

const result = await syncAllWorkspaceData();
console.log(
  `[local-sync] workspaces=${result.workspaceCount} tasks=${result.taskCount} roadmap=${result.roadmapNodeCount} checkpoints=${result.checkpointCount} history=${result.historyCount} specs=${result.specCount}`,
);
