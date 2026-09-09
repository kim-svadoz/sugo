import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// §D.1 "4파일 하드 규칙": package.json의 version이 정본(source of truth)이고,
// plugin.json / package-lock.json(2곳) / .claude-plugin/marketplace.json이 이를 따라간다.
// 순수 함수로 분리해 test/syncVersion.test.ts에서 실제 파일 IO 없이 검증한다.

/** @param {string} json @param {string} version @returns {{text:string, changed:boolean}} */
export function syncPluginJson(json, version) {
  const data = JSON.parse(json);
  const changed = data.version !== version;
  data.version = version;
  return { text: JSON.stringify(data, null, 2) + "\n", changed };
}

/** @param {string} json @param {string} version @returns {{text:string, changed:boolean}} */
export function syncPackageLockJson(json, version) {
  const data = JSON.parse(json);
  const changed = data.version !== version || data.packages?.[""]?.version !== version;
  data.version = version;
  if (data.packages && data.packages[""]) {
    data.packages[""].version = version;
  }
  return { text: JSON.stringify(data, null, 2) + "\n", changed };
}

/** @param {string} json @param {string} version @param {string} pluginName @returns {{text:string, changed:boolean}} */
export function syncMarketplaceJson(json, version, pluginName = "sugo") {
  const data = JSON.parse(json);
  let changed = false;
  for (const plugin of data.plugins ?? []) {
    if (plugin.name === pluginName && plugin.version !== version) {
      plugin.version = version;
      changed = true;
    }
  }
  return { text: JSON.stringify(data, null, 2) + "\n", changed };
}

function main() {
  const pkgPath = join(__dirname, "package.json");
  const pluginPath = join(__dirname, ".claude-plugin", "plugin.json");
  const lockPath = join(__dirname, "package-lock.json");
  const marketplacePath = join(__dirname, "..", ".claude-plugin", "marketplace.json");

  const version = JSON.parse(readFileSync(pkgPath, "utf8")).version;

  const targets = [
    { path: pluginPath, sync: syncPluginJson },
    { path: lockPath, sync: syncPackageLockJson },
    { path: marketplacePath, sync: (json, v) => syncMarketplaceJson(json, v) },
  ];

  let anyChanged = false;
  for (const { path, sync } of targets) {
    const before = readFileSync(path, "utf8");
    const { text, changed } = sync(before, version);
    if (changed) {
      writeFileSync(path, text);
      anyChanged = true;
      console.log(`버전 동기화: ${path} → ${version}`);
    }
  }

  if (!anyChanged) {
    console.log(`버전 동기화: 이미 4파일 모두 ${version} — 변경 없음.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
