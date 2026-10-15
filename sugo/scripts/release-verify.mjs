import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const patch = Number(version.split(".")[2] ?? 0);
const full = patch % 10 === 0;
console.log(`[release-verify] ${version}: ${full ? "full" : "core"} cold smoke`);
const scripts = full ? ["cold-smoke-core.mjs", "cold-smoke.mjs"] : ["cold-smoke-core.mjs"];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [join(root, "scripts", script)], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
