import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const source = join(dirname(fileURLToPath(import.meta.url)), "..");
const shipped = [".claude-plugin", "dist", "harness-library", "wasm-grammars", "commands", "agents", "skills", "hooks"];
const root = mkdtempSync(join(tmpdir(), "sugo-core-smoke-"));
const failures = [];
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

  const server = spawn(process.execPath, [join(install, "dist", "index.bundle.mjs")], {
    env: { ...process.env, SUGO_HOME_OVERRIDE: home }, stdio: ["pipe", "pipe", "inherit"],
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
  const preview = await call("sugo_uninstall", { action: "preview" });
  check("제거 preview와 명시 확인 계약", preview.requiredConfirmation === "DELETE_SUGO_DATA");
  const removed = await call("sugo_uninstall", { action: "execute", confirmation: "DELETE_SUGO_DATA" });
  check("제거 후 전역 데이터 없음", removed.verifiedClean === true && !existsSync(join(home, ".claude", "sugo")));
  check("프로젝트 Sugo 데이터 없음", !existsSync(join(project, "sugo")));
  check("Claude/Codex 사용자 설정 원문 복원", readFileSync(join(project, "CLAUDE.md"), "utf8") === "# User Claude\n" && readFileSync(join(project, "AGENTS.md"), "utf8") === "# User Agents\n");
  check("사용자 규칙 보존", readFileSync(join(project, ".claude", "rules", "user.md"), "utf8") === "user rule\n");
  server.kill();
} catch (error) {
  failures.push(String(error)); console.error(error);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(`${failures.length ? "FAIL" : "PASS"} core cold smoke (${failures.length} failures)`);
process.exit(failures.length ? 1 : 0);
