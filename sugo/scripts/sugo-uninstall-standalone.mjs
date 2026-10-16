#!/usr/bin/env node
import { access, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const mode = process.argv[2];
if (!new Set(["uninstall", "purge"]).has(mode)) {
  console.error("Usage: node ~/.sugo/bin/sugo-uninstall.mjs <uninstall|purge>"); process.exit(2);
}
const home = process.env.SUGO_HOME_OVERRIDE ?? homedir();
const active = join(home, ".claude", "sugo");
const product = join(home, ".sugo");
const archive = join(product, "data");
const registry = await readFile(join(active, "registry.json"), "utf8").then(JSON.parse, () => []);

// 서버가 DB를 연 채로 폴더를 옮기거나 지우지 않도록 먼저 멈춘다. 기록된 포트가 대시보드 health에 응답할 때만 종료 신호를 보낸다.
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const state = await readFile(join(active, "dashboard", "server.json"), "utf8").then(JSON.parse, () => null);
if (state && alive(state.pid)) {
  const healthy = await fetch(`http://127.0.0.1:${state.port}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  if (!healthy) { console.error(`Dashboard process ${state.pid} could not be verified. Stop it manually, then run again. Nothing was changed.`); process.exit(1); }
  process.kill(state.pid, "SIGTERM");
  for (let i = 0; i < 50 && alive(state.pid); i++) await new Promise((r) => setTimeout(r, 100));
  if (alive(state.pid)) process.kill(state.pid, "SIGKILL");
}

function strip(content, start, end) {
  const a = content.indexOf(start), b = content.indexOf(end);
  if (a < 0 || b < a) return content;
  let before = content.slice(0, a); const after = content.slice(b + end.length);
  if (!after && before.endsWith("\n\n")) before = before.slice(0, -1);
  return before + after;
}
async function prune(path, stop) {
  let current = dirname(path);
  while (current.startsWith(stop) && current !== stop) {
    if (!await rmdir(current).then(() => true, () => false)) break;
    current = dirname(current);
  }
}
for (const entry of registry) {
  const root = resolve(entry.path);
  const manifestPath = join(root, "sugo", "install-manifest.json");
  const manifest = await readFile(manifestPath, "utf8").then(JSON.parse, () => null);
  if (!manifest) { console.warn(`PRESERVED (no ownership manifest): ${root}`); continue; }
  for (const [name, original, start, end] of [
    ["CLAUDE.md", manifest.rootClaudeOriginal, "<!-- sugo:harness-rules:start -->", "<!-- sugo:harness-rules:end -->"],
    ["AGENTS.md", manifest.rootAgentsOriginal, "<!-- sugo:project-context:start -->", "<!-- sugo:project-context:end -->"],
  ]) {
    const path = join(root, name); const current = await readFile(path, "utf8").catch(() => null);
    if (current === null) continue; const clean = strip(current, start, end);
    if (typeof original === "string" && clean.startsWith(original) && clean.slice(original.length).trim() === "") await writeFile(path, original);
    else if (original && typeof original === "object" && original.existed) {
      const bytes = Buffer.from(clean); const prefix = bytes.subarray(0, original.byteLength).toString();
      const matches = createHash("sha256").update(prefix).digest("hex") === original.sha256 && bytes.subarray(original.byteLength).toString().trim() === "";
      await writeFile(path, matches ? prefix : clean);
    } else if ((original === null || (typeof original === "object" && !original.existed)) && clean.trim() === "") await rm(path, { force: true });
    else await writeFile(path, clean);
  }
  for (const rel of manifest.managedFiles ?? []) {
    const path = join(root, rel); await rm(path, { recursive: true, force: true });
    await prune(path, rel.startsWith("sugo/") ? join(root, "sugo") : join(root, ".claude", "rules"));
  }
  await rm(manifestPath, { force: true });
  if (!manifest.sugoDirExisted) await rm(join(root, "sugo"), { recursive: true, force: true });
  else await rmdir(join(root, "sugo")).catch(() => {});
}
if (mode === "uninstall") {
  await mkdir(product, { recursive: true }); await rm(archive, { recursive: true, force: true });
  if (await access(active).then(() => true, () => false)) await rename(active, archive);
  console.log(`Sugo detached. Retained data: ${archive}`);
} else {
  await rm(active, { recursive: true, force: true }); await rm(product, { recursive: true, force: true });
  console.log("Sugo purged.");
}
