import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [archiveArg, outputArg, repository = process.env.GITHUB_REPOSITORY] = process.argv.slice(2);
if (!archiveArg || !outputArg || !repository) {
  console.error("usage: node write-runtime-release.mjs <archive.tgz> <manifest.json> [owner/repo]");
  process.exit(2);
}
const archive = resolve(archiveArg);
const output = resolve(outputArg);
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const bytes = readFileSync(archive);
const assetName = "console-runtime.tgz";
const manifest = {
  runtimeSchemaVersion: 1,
  engineApiVersion: 1,
  consoleVersion: pkg.version,
  archiveUrl: `https://github.com/${repository}/releases/download/console-v${pkg.version}/${assetName}`,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Console runtime release manifest: ${pkg.version} ${manifest.sha256}`);
