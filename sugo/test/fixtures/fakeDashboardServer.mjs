// 실제 서버 번들과 같은 계약(health·상태 파일·SIGTERM 정리)을 가진 작은 대역. 테스트가 진짜 프로세스로 띄운다.
import { createServer } from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.env.FAKE_FAIL) { console.error("fake start failure"); process.exit(1); }
const port = Number(process.env.SUGO_DASHBOARD_PORT);
const dir = join(process.env.SUGO_HOME_OVERRIDE, ".claude", "sugo", "dashboard");
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok", version: "1.0.0", build: process.env.BUILD_ID }));
});
server.listen(port, "127.0.0.1", () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "server.json"), JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }));
});
process.on("SIGTERM", () => { rmSync(join(dir, "server.json"), { force: true }); process.exit(0); });
