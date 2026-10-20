import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const source = join(dirname(fileURLToPath(import.meta.url)), "..");
const shipped = [".claude-plugin", "dist", "dashboard-runtime", "harness-library", "wasm-grammars", "commands", "agents", "skills", "hooks", "scripts"];
const root = mkdtempSync(join(tmpdir(), "sugo-core-smoke-"));
const failures = [];
let dashboardServer;
const check = (label, pass) => { console.log(`${pass ? "PASS" : "FAIL"} ${label}`); if (!pass) failures.push(label); };

try {
  const install = join(root, "plugin");
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(install, { recursive: true }); mkdirSync(home); mkdirSync(join(project, ".claude", "rules"), { recursive: true });
  for (const path of shipped) cpSync(join(source, path), join(install, path), { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "cold-core" }));
  writeFileSync(join(project, "CLAUDE.md"), "# User Claude\n");
  writeFileSync(join(project, "AGENTS.md"), "# User Agents\n");
  writeFileSync(join(project, ".claude", "rules", "user.md"), "user rule\n");

  let attachedSpecPath = null;
  dashboardServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url?.includes("/spec-document")) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => { attachedSpecPath = JSON.parse(body).specPath; res.end("{}"); });
      return;
    }
    if (req.url?.includes("/spec-attachments")) return res.end(JSON.stringify({ attachments: [] }));
    if (req.url?.includes("/spec-references")) return res.end(JSON.stringify({ links: [] }));
    return res.end(JSON.stringify({ nodes: [{
      id: "spec-manual-cold", title: "콜드 시작 기능", level: "spec", status: "pending", parent: null,
      project_path: project, spec_path: null,
    }] }));
  });
  await new Promise((resolve) => dashboardServer.listen(0, "127.0.0.1", resolve));
  const dashboardUrl = `http://127.0.0.1:${dashboardServer.address().port}`;

  const server = spawn(process.execPath, [join(install, "dist", "index.bundle.mjs")], {
    env: { ...process.env, SUGO_HOME_OVERRIDE: home, SUGO_DASHBOARD_API_URL: dashboardUrl, SUGO_DASHBOARD_USER_ID: "cold-user" }, stdio: ["pipe", "pipe", "inherit"],
  });
  let buffer = ""; let id = 0; const pending = new Map();
  server.stdout.on("data", (chunk) => { buffer += chunk; let at; while ((at = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1); if (!line) continue;
    const message = JSON.parse(line); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  }});
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, resolve);
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 30000);
  });
  const call = async (name, args) => {
    const response = await rpc("tools/call", { name, arguments: args });
    return JSON.parse(response.result?.content?.[0]?.text ?? "{}");
  };
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "core-smoke", version: "0" } });
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const first = await call("sugo_add", { projectPath: project, workspace: "core" });
  const manifestBefore = readFileSync(join(project, "sugo", "install-manifest.json"), "utf8");
  const second = await call("sugo_add", { projectPath: project, workspace: "core" });
  const updated = await call("sugo_update", { projectPath: project });
  check("콜드 add/add/update 성공", first.ok !== false && second.ok !== false && updated.ok !== false);
  check("설치 ownership manifest 멱등", readFileSync(join(project, "sugo", "install-manifest.json"), "utf8") === manifestBefore);
  const specContext = await call("sugo_spec_writer", { action: "context", workspace: "core", projectPath: project, specDraftId: "spec-manual-cold" });
  const expectedSpecRoot = join(home, ".claude", "sugo", "specs");
  check("최초 SPEC 경로는 현재 사용자 Sugo 데이터 루트에서 계산", specContext.specTarget?.path.startsWith(expectedSpecRoot) && /[/\\]v1[/\\]spec\.md$/.test(specContext.specTarget.path));
  mkdirSync(dirname(specContext.specTarget.path), { recursive: true });
  writeFileSync(specContext.specTarget.path, "# 콜드 시작 기능\n\n## 배경/목적\n배포 번들 경로 계약을 검증합니다.\n\n## 범위\n사용자별 저장 위치를 사용합니다.\n\n## 요구사항\n### REQ-1: 경로\n개인 하드코딩 없이 동작합니다.\n\n## 완료조건\nSPEC이 연결됩니다.\n\n## 제약\n없음\n\n## Open Questions\n없음\n\n## Sources\n콜드 시작 기능\n");
  const specComplete = await call("sugo_spec_writer", {
    action: "complete", workspace: "core", projectPath: project, specDraftId: "spec-manual-cold", specPath: specContext.specTarget.path,
    reviewEvidence: {
      projectFiles: ["package.json"], attachmentPaths: [], referenceUrls: [],
      alignmentSummary: "콜드 프로젝트의 package.json을 읽고 사용자별 SPEC 저장 위치 계약과 현재 프로젝트 경계를 확인했습니다.",
      blockingQuestionsResolved: true, unreadableSources: [],
    },
  });
  check("배포 번들 최초 SPEC 연결", specComplete.ok === true && attachedSpecPath === specContext.specTarget.path);
  const nextSpecContext = await call("sugo_spec_writer", { action: "context", workspace: "core", projectPath: project, specDraftId: "spec-manual-cold" });
  check("기존 SPEC을 덮지 않고 다음 버전 제안", nextSpecContext.specTarget?.version === 2 && /[/\\]v2[/\\]spec\.md$/.test(nextSpecContext.specTarget.path));
  const preview = await call("sugo_uninstall", { action: "preview" });
  check("제거 preview와 명시 확인 계약", preview.requiredConfirmation === "UNINSTALL_SUGO");
  check("캐시 선삭제 복구용 독립 제거기 설치", existsSync(join(home, ".sugo", "bin", "sugo-uninstall.mjs")));
  const removed = await call("sugo_uninstall", { action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO" });
  check("제거 후 전역 데이터 없음", removed.verifiedClean === true && !existsSync(join(home, ".claude", "sugo")));
  check("프로젝트 Sugo 데이터 없음", !existsSync(join(project, "sugo")));
  check("데이터는 영향 없는 제품 영역에 보관", existsSync(join(home, ".sugo", "data", "registry.json")));
  check("작성한 SPEC도 제거 시 사용자 보관 데이터로 이동", existsSync(join(home, ".sugo", "data", "specs")));
  check("일반 제거 후 독립 제거기 유지", existsSync(join(home, ".sugo", "bin", "sugo-uninstall.mjs")));
  check("Claude/Codex 사용자 설정 원문 복원", readFileSync(join(project, "CLAUDE.md"), "utf8") === "# User Claude\n" && readFileSync(join(project, "AGENTS.md"), "utf8") === "# User Agents\n");
  check("사용자 규칙 보존", readFileSync(join(project, ".claude", "rules", "user.md"), "utf8") === "user rule\n");
  server.kill();
} catch (error) {
  failures.push(String(error)); console.error(error);
} finally {
  if (dashboardServer) await new Promise((resolve) => dashboardServer.close(resolve));
  rmSync(root, { recursive: true, force: true });
}
console.log(`${failures.length ? "FAIL" : "PASS"} core cold smoke (${failures.length} failures)`);
process.exit(failures.length ? 1 : 0);
