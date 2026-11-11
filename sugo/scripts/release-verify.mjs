import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseVerificationScripts } from "./releaseVerifyPlan.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const scope = scopeArg?.slice("--scope=".length) ?? "console";
if (!["plugin", "console", "full"].includes(scope)) {
  console.error(`[release-verify] unknown scope: ${scope}`);
  process.exit(2);
}
const scripts = releaseVerificationScripts(version, scope);
console.log(`[release-verify] ${version}: ${scope} -> ${scripts.join(", ")}`);
for (const script of scripts) {
  const result = spawnSync(process.execPath, [join(root, "scripts", script)], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
