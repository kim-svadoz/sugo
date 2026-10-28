import { createRequire as __sugoCreateRequire } from "node:module";
import { fileURLToPath as __sugoFileURLToPath } from "node:url";
import { dirname as __sugoDirname } from "node:path";
const require = __sugoCreateRequire(import.meta.url);
const __filename = __sugoFileURLToPath(import.meta.url);
const __dirname = __sugoDirname(__filename);

// src/projectRegistration.ts
import { access as access2, readdir as readdir2, stat as stat2 } from "node:fs/promises";
import { join as join10, resolve as resolve2 } from "node:path";

// src/homeDir.ts
import { homedir } from "node:os";
function sugoHomeDir() {
  return process.env.SUGO_HOME_OVERRIDE ?? homedir();
}

// src/harness/sync.ts
import { access, mkdir as mkdir5, readFile as readFile4, unlink as unlink2 } from "node:fs/promises";
import { basename, dirname as dirname6, join as join7 } from "node:path";

// src/fsUtil.ts
import { mkdir, open, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
var seq = 0;
async function atomicWriteFile(path, content) {
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}.${seq++}`;
  await writeFile(tmpPath, content, "utf-8");
  const delays = [0, 25, 50, 100, 200];
  let lastErr;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      await rename(tmpPath, path);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  await unlink(tmpPath).catch(() => {
  });
  throw lastErr;
}
var STALE_LOCK_MS = 3e4;
async function withFileLock(lockPath, fn) {
  await mkdir(dirname(lockPath), { recursive: true });
  const maxAttempts = 40;
  const baseDelayMs = 10;
  const maxDelayMs = 250;
  let acquired = false;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * backoff * 0.5;
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      acquired = true;
      break;
    } catch (err) {
      lastErr = err;
      const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > STALE_LOCK_MS) await unlink(lockPath).catch(() => {
      });
    }
  }
  if (!acquired) {
    throw new Error(`\uB77D \uD30C\uC77C\uC744 \uD68D\uB4DD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${lockPath} (${String(lastErr)})`);
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {
    });
  }
}

// src/harness/config.ts
import { mkdir as mkdir2, readFile } from "node:fs/promises";
import { dirname as dirname2, join } from "node:path";
function projectSugoDir(projectPath) {
  return join(projectPath, "sugo");
}
function projectConfigPath(projectPath) {
  return join(projectSugoDir(projectPath), "config.json");
}
async function saveProjectConfig(config) {
  const path = projectConfigPath(config.projectPath);
  await mkdir2(dirname2(path), { recursive: true });
  await atomicWriteFile(path, JSON.stringify(config, null, 2));
}
async function loadProjectConfig(projectPath) {
  try {
    const raw = await readFile(projectConfigPath(projectPath), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// src/harness/contentHash.ts
import { createHash } from "node:crypto";
function hashHarnessContent(harness) {
  return createHash("sha1").update(harness.harnessMd).update("\0").update(harness.validationYaml).digest("hex");
}

// src/harness/harnessComposer.ts
function extractCoreRuleBullets(harnessMd, limit = 2) {
  const lines = harnessMd.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => /^#{1,3}\s*핵심 규칙/.test(l.trim()));
  if (headingIdx === -1) return [];
  const bullets = [];
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,3}\s/.test(line)) break;
    const m = line.match(/^(?:\d+\.|-)\s+(.*)$/);
    if (m) bullets.push(m[1]);
    if (bullets.length >= limit) break;
  }
  return bullets;
}
function formatItemList(items) {
  if (items.length === 0) return "(\uC5C6\uC74C)";
  const labels = items.map((i) => i.version ? `${i.name} ${i.version}` : i.name);
  return Array.from(new Set(labels)).join(", ");
}
function formatCommands(commands) {
  const entries = Object.entries(commands).filter(([, v]) => v);
  if (entries.length === 0) return "(\uAC10\uC9C0\uB41C \uBA85\uB839 \uC5C6\uC74C)";
  return entries.map(([k, v]) => `${k}=\`${v}\``).join(", ");
}
function compose(params) {
  const { harnesses, projectName, workspace, detectedStack, fetchWarnings } = params;
  const harnessFiles = [];
  for (const h of harnesses) {
    harnessFiles.push({ relPath: `sugo/harness/${h.id}/harness.md`, content: h.harnessMd });
    harnessFiles.push({ relPath: `sugo/harness/${h.id}/validation.yaml`, content: h.validationYaml });
  }
  const appliedTableRows = harnesses.map((h) => `| \`${h.id}\` | ${h.source === "default-fallback" ? "(\uD3F4\uBC31) " : ""}${h.version} |`).join("\n");
  const ruleSummaryBlocks = harnesses.map((h) => {
    const bullets = extractCoreRuleBullets(h.harnessMd);
    if (bullets.length === 0) return `### \`${h.id}\`
(\uD575\uC2EC \uADDC\uCE59 \uC139\uC158 \uC5C6\uC74C \u2014 harness.md \uCC38\uACE0)`;
    return `### \`${h.id}\`
${bullets.map((b) => `- ${b}`).join("\n")}`;
  }).join("\n\n");
  const allWarnings = [...fetchWarnings];
  const claudeMd = `# ${projectName} \u2014 Sugo \uD558\uB124\uC2A4 \uC778\uB371\uC2A4

> \uC790\uB3D9 \uC0DD\uC131\uB428. \`sugo:add\`\uB97C \uB2E4\uC2DC \uC2E4\uD589\uD558\uBA74 \uAC31\uC2E0\uB429\uB2C8\uB2E4. \uAC1C\uBCC4 \uD558\uB124\uC2A4 \uC804\uBB38\uC740
> \`sugo/harness/<id>/harness.md\`, \uAC80\uC99D \uC124\uC815\uC740 \`sugo/harness/<id>/validation.yaml\`\uC744 \uCC38\uACE0\uD558\uC138\uC694.
> \uC774 \uD30C\uC77C \uC790\uCCB4\uB294 \uCC38\uACE0\uC6A9 \uC778\uB371\uC2A4\uC785\uB2C8\uB2E4 \u2014 Claude Code\uAC00 \uC138\uC158 \uC2DC\uC791 \uC2DC \uC790\uB3D9\uC73C\uB85C \uC77D\uB294 \uAC74
> \`.claude/rules/*.md\`\uC640 \uD504\uB85C\uC81D\uD2B8 \uB8E8\uD2B8 \`CLAUDE.md\`\uC774\uBA70, \uC5EC\uAE30 \uC788\uB294 \uC694\uC57D\uC740 \uADF8\uAC78 \uBCF4\uC644\uD569\uB2C8\uB2E4.
${workspace ? `>
> \uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4: \`${workspace}\`` : ""}

## \uAC10\uC9C0\uB41C \uC2A4\uD0DD

- **\uC5B8\uC5B4:** ${formatItemList(detectedStack.languages)}
- **\uD504\uB808\uC784\uC6CC\uD06C:** ${formatItemList(detectedStack.frameworks)}
- **\uBE4C\uB4DC\uB3C4\uAD6C:** ${formatItemList(detectedStack.buildTools)}
- **\uB370\uC774\uD130\uC2A4\uD1A0\uC5B4(\uC815\uBCF4\uC131 \u2014 \uBCC4\uB3C4 \uD558\uB124\uC2A4 \uBBF8\uC801\uC6A9):** ${formatItemList(detectedStack.dataStores)}
- **\uC778\uD504\uB77C(\uC815\uBCF4\uC131):** ${formatItemList(detectedStack.infra)}
- **\uAC10\uC9C0\uB41C \uBA85\uB839:** ${formatCommands(detectedStack.commands)}

## \uC801\uC6A9\uB41C \uD558\uB124\uC2A4

| id | version |
|----|---------|
${appliedTableRows}

## \uD575\uC2EC \uADDC\uCE59 \uC694\uC57D

${ruleSummaryBlocks}

## \uAC80\uC99D \uAC8C\uC774\uD2B8 \uC139\uC158

sugo \uD30C\uC774\uD504\uB77C\uC778\uC758 \uC21C\uC11C\uAC15\uC81C\xB7\uCF58\uD150\uCE20 \uAC8C\uC774\uD2B8(analyze \uD638\uCD9C\uAC15\uC81C, baseline, wiring/glue/boot, \uD14C\uC2A4\uD2B8\uC99D\uAC70\uB300\uC870,
review 4\uC911\uAC80\uC99D \uB4F1)\uB294 \uC2E4\uC81C\uB85C \uC9D1\uD589\uB429\uB2C8\uB2E4(\`sugo_plan\` \uC0C1\uD0DC\uBA38\uC2E0). \uC704 \uD45C\uC758 \uAC01 \uD558\uB124\uC2A4 \`validation.yaml\`\uC740
\`sugo_validate\`(review \uB2E8\uACC4)\uAC00 \uB300\uC870\uD569\uB2C8\uB2E4 \u2014 \uADF8\uC911 \`auto\`\uAC00 \uC120\uC5B8\uB41C \uCCB4\uD06C\uB294 \uC11C\uBC84\uAC00 \uD30C\uC77C\uC744 \uC9C1\uC811 \uC77D\uC5B4
\uC2E4\uCE21\uD558\uACE0, \uADF8 \uACB0\uACFC\uAC00 \uC5D0\uC774\uC804\uD2B8\uC758 \uC790\uAE30\uBCF4\uACE0\uBCF4\uB2E4 \uC6B0\uC120\uD569\uB2C8\uB2E4(\uC8FC\uC7A5\uACFC \uC5B4\uAE0B\uB098\uBA74 \`contradictions\`\uC5D0 \uB0A8\uC2B5\uB2C8\uB2E4).
**\uB2E4\uB9CC \uC544\uC9C1 \uBAA8\uB4E0 \uCCB4\uD06C\uAC00 \uC2E4\uCE21\uB418\uB294 \uAC74 \uC544\uB2D9\uB2C8\uB2E4** \u2014 \uB300\uBD80\uBD84\uC740 review-agent\uC758 \uC790\uAE30\uBCF4\uACE0\uC774\uACE0,
\`review_done\`\uC774 \uAC80\uC99D \uC2E4\uD328\uB97C \uC774\uC720\uB85C \uD30C\uC774\uD504\uB77C\uC778\uC744 \uB9C9\uB294 \uD558\uB4DC \uAC8C\uC774\uD2B8\uB85C \uC2B9\uACA9\uB418\uC9C0\uB3C4 \uC54A\uC558\uC2B5\uB2C8\uB2E4.
"\uD575\uC2EC \uADDC\uCE59 \uC694\uC57D"\uC740 \uADF8 \uCC28\uC774\uB97C \uC54C\uACE0 \uCC38\uACE0 \uC790\uB8CC\uB85C \uD65C\uC6A9\uD558\uC138\uC694.

${allWarnings.length > 0 ? `## \uACBD\uACE0

${allWarnings.map((w) => `- ${w}`).join("\n")}
` : ""}`;
  return {
    claudeMd,
    harnessFiles,
    appliedHarnesses: harnesses.map((h) => ({ id: h.id, version: h.version })),
    warnings: allWarnings
  };
}

// src/harness/harnessFetcher.ts
import { existsSync, readFileSync } from "node:fs";
import { join as join2 } from "node:path";
var LOCAL_HARNESS_VERSION = "1.0.0-local";
var DEFAULT_HARNESS_ID = "default";
var HARNESS_FETCH_COOLDOWN_MS = 5 * 60 * 1e3;
function baseHarnessId(id) {
  const parts = id.split("/");
  if (parts.length <= 2) return null;
  return parts.slice(0, 2).join("/");
}
function readHarnessDir(libraryDir, id, overrideDir) {
  const dir = join2(libraryDir, id);
  const harnessPath = join2(dir, "harness.md");
  const validationPath = join2(dir, "validation.yaml");
  if (!existsSync(harnessPath) || !existsSync(validationPath)) return null;
  return {
    harnessMd: overrideDir && existsSync(join2(overrideDir, id, "harness.md")) ? readFileSync(join2(overrideDir, id, "harness.md"), "utf-8") : readFileSync(harnessPath, "utf-8"),
    validationYaml: overrideDir && existsSync(join2(overrideDir, id, "validation.yaml")) ? readFileSync(join2(overrideDir, id, "validation.yaml"), "utf-8") : readFileSync(validationPath, "utf-8")
  };
}
function fetchFromLocal(harnessIds, libraryDir, overrideDir) {
  const harnesses = [];
  const warnings = [];
  const idsToFetch = harnessIds.length > 0 ? harnessIds : [];
  for (const id of idsToFetch) {
    let hit = readHarnessDir(libraryDir, id, overrideDir);
    let resolvedId = id;
    let source = "local";
    if (!hit) {
      const base = baseHarnessId(id);
      if (base) {
        hit = readHarnessDir(libraryDir, base, overrideDir);
        if (hit) resolvedId = base;
      }
    }
    if (!hit) {
      warnings.push(`\uD558\uB124\uC2A4 id "${id}"\uC5D0 \uB300\uD55C \uB85C\uCEEC \uCF58\uD150\uCE20\uB97C \uCC3E\uC9C0 \uBABB\uD574 default\uB85C \uD3F4\uBC31\uD569\uB2C8\uB2E4.`);
      hit = readHarnessDir(libraryDir, DEFAULT_HARNESS_ID, overrideDir);
      resolvedId = DEFAULT_HARNESS_ID;
      source = "default-fallback";
      if (!hit) {
        throw new Error(`\uB85C\uCEEC \uD558\uB124\uC2A4 \uB77C\uC774\uBE0C\uB7EC\uB9AC\uC5D0 "${DEFAULT_HARNESS_ID}" \uD3F4\uBC31 \uCF58\uD150\uCE20\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4: ${libraryDir}`);
      }
    }
    if (harnesses.some((h) => h.id === resolvedId)) continue;
    harnesses.push({
      id: resolvedId,
      version: LOCAL_HARNESS_VERSION,
      harnessMd: hit.harnessMd,
      validationYaml: hit.validationYaml,
      source
    });
  }
  if (!harnesses.some((h) => h.id === DEFAULT_HARNESS_ID)) {
    const defaultHit = readHarnessDir(libraryDir, DEFAULT_HARNESS_ID, overrideDir);
    if (!defaultHit) {
      throw new Error(`\uB85C\uCEEC \uD558\uB124\uC2A4 \uB77C\uC774\uBE0C\uB7EC\uB9AC\uC5D0 "${DEFAULT_HARNESS_ID}" \uCF58\uD150\uCE20\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4: ${libraryDir}`);
    }
    harnesses.unshift({
      id: DEFAULT_HARNESS_ID,
      version: LOCAL_HARNESS_VERSION,
      harnessMd: defaultHit.harnessMd,
      validationYaml: defaultHit.validationYaml,
      source: "local"
    });
  }
  return { harnesses, warnings };
}
function fetchHarnesses(params) {
  const result = fetchFromLocal(params.harnessIds, params.libraryDir, params.overrideDir);
  if (params.repoUrl) {
    result.warnings.unshift(
      `repoUrl(${params.repoUrl})\uC774 \uC9C0\uC815\uB418\uC5C8\uC9C0\uB9CC git \uAE30\uBC18 \uD558\uB124\uC2A4 fetch\uB294 \uC544\uC9C1 \uAD6C\uD604\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB85C\uCEEC \uD558\uB124\uC2A4 \uB77C\uC774\uBE0C\uB7EC\uB9AC\uB85C \uD3F4\uBC31\uD569\uB2C8\uB2E4.`
    );
  }
  return result;
}

// src/harness/libraryPath.ts
import { existsSync as existsSync2 } from "node:fs";
import { dirname as dirname3, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
function defaultHarnessLibraryDir() {
  const here = dirname3(fileURLToPath(import.meta.url));
  const candidates = [join3(here, "..", "..", "harness-library"), join3(here, "..", "harness-library")];
  for (const c of candidates) {
    if (existsSync2(c)) return c;
  }
  return candidates[0];
}
function userHarnessOverrideDir() {
  return join3(sugoHomeDir(), ".claude", "sugo", "harness-overrides");
}

// src/harness/registry.ts
import { mkdir as mkdir3, readFile as readFile2 } from "node:fs/promises";
import { dirname as dirname4, join as join4, resolve } from "node:path";
function registryPath() {
  return join4(sugoHomeDir(), ".claude", "sugo", "registry.json");
}
function registryLockPath() {
  return `${registryPath()}.lock`;
}
async function readRegistryFile() {
  try {
    const raw = await readFile2(registryPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function findRegistryEntry(projectPath) {
  const normalized = resolve(projectPath);
  const entries = await readRegistryFile();
  return entries.find((e) => resolve(e.path) === normalized) ?? null;
}
async function registerProject(entry) {
  const path = registryPath();
  await mkdir3(dirname4(path), { recursive: true });
  const normalizedPath = resolve(entry.path);
  await withFileLock(registryLockPath(), async () => {
    const current = await readRegistryFile();
    const normalizedEntry = { ...entry, path: normalizedPath };
    const existing = current.find((e) => resolve(e.path) === normalizedPath);
    if (existing && JSON.stringify(existing) === JSON.stringify(normalizedEntry)) return;
    const filtered = current.filter((e) => resolve(e.path) !== normalizedPath);
    filtered.push(normalizedEntry);
    await atomicWriteFile(path, JSON.stringify(filtered, null, 2));
  });
}

// src/harness/claudeMdFreshness.ts
var FRESHNESS_PREFIX = "> \uC801\uC6A9 \uD558\uB124\uC2A4 \uCD5C\uADFC \uBCC0\uACBD: ";
function freshnessLine(dateIso) {
  return `${FRESHNESS_PREFIX}${dateIso}

`;
}
function stripFreshnessLine(content) {
  if (!content.startsWith(FRESHNESS_PREFIX)) return content;
  const idx = content.indexOf("\n\n");
  return idx === -1 ? content : content.slice(idx + 2);
}
function writeClaudeIfChanged(existing, nextBody, nowIso) {
  if (existing !== null && stripFreshnessLine(existing) === nextBody) {
    return { content: existing, changed: false };
  }
  return { content: freshnessLine(nowIso) + nextBody, changed: true };
}

// src/harness/harnessRouting.ts
var JAVA_PREFIXES = ["lang/java", "framework/spring"];
var NODE_PREFIXES = [
  "lang/typescript",
  "lang/javascript",
  "framework/node",
  "framework/react",
  "framework/nextjs",
  "framework/express"
];
var PYTHON_PREFIXES = ["lang/python"];
var PREFIXES_BY_EXTENSION = {
  ".java": JAVA_PREFIXES,
  ".kt": JAVA_PREFIXES,
  ".ts": NODE_PREFIXES,
  ".tsx": NODE_PREFIXES,
  ".mts": NODE_PREFIXES,
  ".cts": NODE_PREFIXES,
  ".js": NODE_PREFIXES,
  ".jsx": NODE_PREFIXES,
  ".mjs": NODE_PREFIXES,
  ".cjs": NODE_PREFIXES,
  ".py": PYTHON_PREFIXES,
  ".pyi": PYTHON_PREFIXES
};
var PREFIXES_BY_FILENAME = {
  "pom.xml": ["buildtool/maven", ...JAVA_PREFIXES],
  "build.gradle": ["buildtool/gradle", ...JAVA_PREFIXES],
  "build.gradle.kts": ["buildtool/gradle", ...JAVA_PREFIXES],
  "settings.gradle": ["buildtool/gradle", ...JAVA_PREFIXES],
  "settings.gradle.kts": ["buildtool/gradle", ...JAVA_PREFIXES],
  "gradle.properties": ["buildtool/gradle", ...JAVA_PREFIXES],
  "libs.versions.toml": ["buildtool/gradle", ...JAVA_PREFIXES],
  "package.json": ["buildtool/npm", ...NODE_PREFIXES],
  "package-lock.json": ["buildtool/npm", ...NODE_PREFIXES],
  "yarn.lock": ["buildtool/yarn", ...NODE_PREFIXES],
  "pnpm-lock.yaml": ["buildtool/pnpm", ...NODE_PREFIXES],
  "pnpm-workspace.yaml": ["buildtool/pnpm", ...NODE_PREFIXES],
  "tsconfig.json": ["lang/typescript"],
  "poetry.lock": ["buildtool/poetry", ...PYTHON_PREFIXES],
  "pyproject.toml": ["buildtool/poetry", "buildtool/pip", ...PYTHON_PREFIXES]
};
function matchesPrefix(harnessId, prefix) {
  return harnessId === prefix || harnessId.startsWith(`${prefix}/`);
}
function globsForHarnessId(harnessId) {
  const globs = /* @__PURE__ */ new Set();
  for (const [ext, prefixes] of Object.entries(PREFIXES_BY_EXTENSION)) {
    if (prefixes.some((p) => matchesPrefix(harnessId, p))) globs.add(`**/*${ext}`);
  }
  for (const [filename, prefixes] of Object.entries(PREFIXES_BY_FILENAME)) {
    if (prefixes.some((p) => matchesPrefix(harnessId, p))) globs.add(`**/${filename}`);
  }
  if (["framework/nextjs", ...NODE_PREFIXES].some((p) => matchesPrefix(harnessId, p))) {
    globs.add("**/next.config.*");
  }
  if (["buildtool/pip", ...PYTHON_PREFIXES].some((p) => matchesPrefix(harnessId, p))) {
    globs.add("**/requirements*.txt");
  }
  return [...globs].sort();
}

// src/harness/rulesFile.ts
function ruleFilename(harnessId) {
  return `${harnessId.replace(/\//g, "-")}.md`;
}
function buildClaudeRuleFile(harnessId, harnessMd) {
  const globs = globsForHarnessId(harnessId);
  const frontmatter = globs.length === 0 ? "" : `---
paths:
${globs.map((g) => `  - "${g}"`).join("\n")}
---

`;
  return { relPath: `.claude/rules/${ruleFilename(harnessId)}`, content: frontmatter + harnessMd };
}
function baseId(id) {
  const parts = id.split("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : null;
}
function buildEffectiveClaudeRuleFiles(harnesses) {
  const byId = new Map(harnesses.map((harness) => [harness.id, harness]));
  const shadowedBases = new Set(harnesses.map((harness) => baseId(harness.id)).filter((id) => id !== null));
  return harnesses.filter((harness) => !shadowedBases.has(harness.id)).map((harness) => {
    const parent = baseId(harness.id);
    const parentHarness = parent ? byId.get(parent) : void 0;
    const content = parentHarness ? `${parentHarness.harnessMd.trimEnd()}

---

${harness.harnessMd.trimStart()}` : harness.harnessMd;
    return buildClaudeRuleFile(harness.id, content);
  });
}
var BLOCK_START = "<!-- sugo:harness-rules:start -->";
var BLOCK_END = "<!-- sugo:harness-rules:end -->";
var AGENTS_BLOCK_START = "<!-- sugo:project-context:start -->";
var AGENTS_BLOCK_END = "<!-- sugo:project-context:end -->";
function buildManagedBlock(harnessIds) {
  const list = harnessIds.length === 0 ? "(\uC801\uC6A9\uB41C \uD558\uB124\uC2A4 \uC5C6\uC74C)" : harnessIds.map((id) => `- \`${id}\``).join("\n");
  return `${BLOCK_START}
<!-- \uC774 \uBE14\uB85D\uC740 sugo\uAC00 \uC790\uB3D9 \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uC190\uC73C\uB85C \uACE0\uCE58\uBA74 \uB2E4\uC74C sugo_add/sugo_update \uB54C \uB36E\uC5B4\uC368\uC9D1\uB2C8\uB2E4. -->
## Sugo \uD558\uB124\uC2A4

\uC774 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC801\uC6A9\uB41C \uCF54\uB529 \uD45C\uC900\uC774 \`.claude/rules/\`\uC5D0 \uC790\uB3D9 \uB85C\uB4DC\uB418\uB3C4\uB85D \uC124\uCE58\uB3FC \uC788\uC2B5\uB2C8\uB2E4.
\uC804\uBB38\uC740 \`sugo/harness/<id>/harness.md\`, \uAC80\uC99D \uC124\uC815\uC740 \`sugo/harness/<id>/validation.yaml\`\uC5D0 \uC788\uC2B5\uB2C8\uB2E4.

${list}
${BLOCK_END}`;
}
function mergeRootClaudeReference(existing, appliedHarnessIds) {
  const block = buildManagedBlock(appliedHarnessIds);
  const base = existing ?? "";
  const startIdx = base.indexOf(BLOCK_START);
  const endIdx = base.indexOf(BLOCK_END);
  if (startIdx === -1 || endIdx === -1) {
    const separator = base.length > 0 && !base.endsWith("\n\n") ? base.endsWith("\n") ? "\n" : "\n\n" : "";
    return { content: base + separator + block + "\n", changed: true };
  }
  const before = base.slice(0, startIdx);
  const after = base.slice(endIdx + BLOCK_END.length);
  const content = before + block + after;
  return { content, changed: content !== base };
}
function mergeRootAgentsReference(existing) {
  const block = `${AGENTS_BLOCK_START}
<!-- \uC774 \uBE14\uB85D\uC740 sugo\uAC00 \uC790\uB3D9 \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uC190\uC73C\uB85C \uACE0\uCE58\uBA74 \uB2E4\uC74C sugo_add/sugo_update \uB54C \uB36E\uC5B4\uC368\uC9D1\uB2C8\uB2E4. -->
## Sugo \uD504\uB85C\uC81D\uD2B8 \uCEE8\uD14D\uC2A4\uD2B8

\uC791\uC5C5\uC744 \uACC4\uD68D\uD558\uAC70\uB098 \uD30C\uC77C\uC744 \uC218\uC815\uD558\uAE30 \uC804\uC5D0 \uC791\uC5C5 \uB300\uC0C1 \uD504\uB85C\uC81D\uD2B8\uC758 \`.claude/rules/\` \uC544\uB798 Markdown \uD30C\uC77C\uC744 \uC7AC\uADC0\uC801\uC73C\uB85C \uD655\uC778\uD55C\uB2E4.
\uC774 \uD30C\uC77C\uB4E4\uC740 Sugo \uD558\uB124\uC2A4\uC640 Dashboard\uC758 \uB3C4\uBA54\uC778 \uADDC\uCE59 \uAD00\uB9AC\uC5D0\uC11C \uB3D9\uAE30\uD654\uD55C \uCCB4\uD06C\uD3EC\uC778\uD2B8\uB2E4.
\uD604\uC7AC \uC791\uC5C5\uC5D0 \uC801\uC6A9\uB418\uB294 \uADDC\uCE59\uC744 \uAD6C\uD604\xB7\uB9AC\uBDF0\xB7\uAC80\uC99D \uD310\uB2E8\uC5D0 \uBC18\uC601\uD558\uACE0, \uCDA9\uB3CC\uD558\uAC70\uB098 \uC801\uC6A9\uD560 \uC218 \uC5C6\uC73C\uBA74 \uACB0\uACFC\uC5D0 \uC774\uC720\uB97C \uBA85\uC2DC\uD55C\uB2E4.
${AGENTS_BLOCK_END}`;
  const base = existing ?? "";
  const startIdx = base.indexOf(AGENTS_BLOCK_START);
  const endIdx = base.indexOf(AGENTS_BLOCK_END);
  if (startIdx === -1 || endIdx === -1) {
    const separator = base.length > 0 && !base.endsWith("\n\n") ? base.endsWith("\n") ? "\n" : "\n\n" : "";
    return { content: base + separator + block + "\n", changed: true };
  }
  const content = base.slice(0, startIdx) + block + base.slice(endIdx + AGENTS_BLOCK_END.length);
  return { content, changed: content !== base };
}

// src/harness/context.ts
import { existsSync as existsSync3, readFileSync as readFileSync2 } from "node:fs";
import { isAbsolute, join as join5 } from "node:path";
function resolvePath(projectPath, relPath) {
  return isAbsolute(relPath) ? relPath : join5(projectPath, relPath);
}
function createFsDetectionContext(projectPath, changedFiles = []) {
  return {
    projectPath,
    changedFiles,
    fileExists(relPath) {
      return existsSync3(resolvePath(projectPath, relPath));
    },
    readFile(relPath) {
      try {
        return readFileSync2(resolvePath(projectPath, relPath), "utf-8");
      } catch {
        return null;
      }
    },
    readJson(relPath) {
      const raw = this.readFile(relPath);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  };
}

// src/harness/rules.ts
function readPackageJson(ctx) {
  return ctx.readJson("package.json");
}
function depVersion(pkg, name) {
  if (!pkg) return void 0;
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name];
}
function hasDep(pkg, ...names) {
  return names.some((n) => depVersion(pkg, n) !== void 0);
}
function readJavaBuildFiles(ctx) {
  return [
    ctx.readFile("pom.xml"),
    ctx.readFile("build.gradle"),
    ctx.readFile("build.gradle.kts")
  ].filter((c) => c !== null).join("\n");
}
function readPythonFiles(ctx) {
  return [ctx.readFile("requirements.txt"), ctx.readFile("pyproject.toml")].filter((c) => c !== null).join("\n");
}
function nearestBucket(value, buckets) {
  let hit = null;
  for (const b of buckets) if (value >= b) hit = b;
  return hit;
}
function majorFromRange(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
function withVersionBucket(base, bucket) {
  if (bucket === null) return [base];
  return [base, { ...base, id: `${base.id}/${bucket}`, version: bucket }];
}
var JAVA_BUCKETS = [8, 11, 17, 21, 25];
var PYTHON_MINOR_BUCKETS = [9, 10, 12, 14];
var REACT_BUCKETS = [18, 19];
var NEXT_BUCKETS = [15, 16];
var SPRING_BUCKETS = [2, 3, 4];
var TYPESCRIPT_BUCKETS = [5, 6, 7];
var NODE_BUCKETS = [20, 22, 24];
var EXPRESS_BUCKETS = [4, 5];
var GRADLE_BUCKETS = [8, 9];
var PNPM_BUCKETS = [10, 12];
var POETRY_BUCKETS = [1, 2];
function extractNodeMajor(ctx, pkg) {
  const engines = pkg?.engines?.node;
  const fromEngines = majorFromRange(engines);
  if (fromEngines !== null) return fromEngines;
  for (const file of [".nvmrc", ".node-version"]) {
    const raw = ctx.readFile(file);
    const major = majorFromRange(raw?.trim());
    if (major !== null) return major;
  }
  return null;
}
function packageManagerMajor(pkg, tool) {
  const raw = pkg?.packageManager;
  if (!raw || !raw.startsWith(`${tool}@`)) return null;
  return majorFromRange(raw.slice(tool.length + 1));
}
function extractJavaMajor(javaSrc) {
  const patterns = [
    /<java\.version>\s*(?:1\.)?(\d+)/,
    /<maven\.compiler\.release>\s*(?:1\.)?(\d+)/,
    /<maven\.compiler\.(?:source|target)>\s*(?:1\.)?(\d+)/,
    /<release>\s*(?:1\.)?(\d+)\s*<\/release>/,
    /JavaLanguageVersion\.of\(\s*['"]?(\d+)/,
    /(?:source|target)Compatibility\s*=?\s*['"]?(?:JavaVersion\.VERSION_)?(?:1[._])?(\d+)/,
    /options\.release\s*(?:\.set\()?\s*=?\s*['"]?(\d+)/
  ];
  for (const re of patterns) {
    const m = javaSrc.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}
function extractPythonMinor(ctx) {
  const pyproject = ctx.readFile("pyproject.toml");
  if (pyproject) {
    const patterns = [
      /requires-python\s*=\s*["'][^"']*?3\.(\d+)/,
      /^\s*python\s*=\s*["'][^"']*?3\.(\d+)/m,
      /target-version\s*=\s*["']py3(\d+)["']/
    ];
    for (const re of patterns) {
      const m = pyproject.match(re);
      if (m) return Number(m[1]);
    }
  }
  for (const file of [".python-version", "runtime.txt"]) {
    const content = ctx.readFile(file);
    const m = content?.match(/3\.(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}
function extractSpringMajor(javaSrc) {
  const patterns = [
    /<spring-boot\.version>\s*(\d+)\.(\d+)\.(\d+)/,
    /spring-boot-starter-parent[\s\S]{0,200}?<version>\s*(\d+)\.(\d+)\.(\d+)/,
    /org\.springframework\.boot['"]\s*\)?\s*version\s*['"](\d+)\.(\d+)\.(\d+)/
  ];
  for (const re of patterns) {
    const m = javaSrc.match(re);
    if (m) return m[1];
  }
  return void 0;
}
var langTypescript = {
  id: "lang/typescript",
  category: "language",
  detect(ctx) {
    if (!ctx.fileExists("tsconfig.json")) return null;
    const pkg = readPackageJson(ctx);
    const declared = depVersion(pkg, "typescript");
    const bucket = nearestBucket(majorFromRange(declared) ?? -1, TYPESCRIPT_BUCKETS);
    return withVersionBucket(
      {
        id: "lang/typescript",
        category: "language",
        name: "TypeScript",
        version: declared,
        detectedBy: "tsconfig.json"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
var langJavascript = {
  id: "lang/javascript",
  category: "language",
  detect(ctx) {
    if (!ctx.fileExists("package.json") || ctx.fileExists("tsconfig.json")) return null;
    return { id: "lang/javascript", category: "language", name: "JavaScript", detectedBy: "package.json" };
  }
};
var langJava = {
  id: "lang/java",
  category: "language",
  detect(ctx) {
    const marker = ["pom.xml", "build.gradle", "build.gradle.kts"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    const major = extractJavaMajor(readJavaBuildFiles(ctx));
    const bucket = major === null ? null : nearestBucket(major, JAVA_BUCKETS);
    return withVersionBucket(
      { id: "lang/java", category: "language", name: "Java", version: major ? String(major) : void 0, detectedBy: marker },
      bucket === null ? null : String(bucket)
    );
  }
};
var langPython = {
  id: "lang/python",
  category: "language",
  detect(ctx) {
    const marker = ["requirements.txt", "pyproject.toml"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    const minor = extractPythonMinor(ctx);
    const bucket = minor === null ? null : nearestBucket(minor, PYTHON_MINOR_BUCKETS);
    return withVersionBucket(
      { id: "lang/python", category: "language", name: "Python", version: minor ? `3.${minor}` : void 0, detectedBy: marker },
      bucket === null ? null : `3.${bucket}`
    );
  }
};
var frameworkNode = {
  id: "framework/node",
  category: "framework",
  detect(ctx) {
    if (!ctx.fileExists("package.json")) return null;
    const pkg = readPackageJson(ctx);
    const major = extractNodeMajor(ctx, pkg);
    const bucket = major === null ? null : nearestBucket(major, NODE_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/node",
        category: "framework",
        name: "Node.js",
        version: major === null ? void 0 : String(major),
        detectedBy: "package.json"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
var frameworkReact = {
  id: "framework/react",
  category: "framework",
  detect(ctx) {
    const pkg = readPackageJson(ctx);
    if (!hasDep(pkg, "react")) return null;
    const major = majorFromRange(depVersion(pkg, "react"));
    const bucket = major === null ? null : nearestBucket(major, REACT_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/react",
        category: "framework",
        name: "React",
        version: depVersion(pkg, "react"),
        detectedBy: "package.json:dependencies.react"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
var frameworkNextjs = {
  id: "framework/nextjs",
  category: "framework",
  detect(ctx) {
    const pkg = readPackageJson(ctx);
    if (!hasDep(pkg, "next")) return null;
    const major = majorFromRange(depVersion(pkg, "next"));
    const bucket = major === null ? null : nearestBucket(major, NEXT_BUCKETS);
    const appRouter = ctx.fileExists("app") || ctx.fileExists("src/app");
    return withVersionBucket(
      {
        id: "framework/nextjs",
        category: "framework",
        name: appRouter ? "Next.js (App Router)" : "Next.js",
        version: depVersion(pkg, "next"),
        detectedBy: "package.json:dependencies.next"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
var frameworkExpress = {
  id: "framework/express",
  category: "framework",
  detect(ctx) {
    const pkg = readPackageJson(ctx);
    if (!hasDep(pkg, "express")) return null;
    const declared = depVersion(pkg, "express");
    const bucket = nearestBucket(majorFromRange(declared) ?? -1, EXPRESS_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/express",
        category: "framework",
        name: "Express",
        version: declared,
        detectedBy: "package.json:dependencies.express"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
var frameworkSpring = {
  id: "framework/spring",
  category: "framework",
  detect(ctx) {
    const src = readJavaBuildFiles(ctx);
    if (!src || !/spring-boot|org\.springframework\.boot/.test(src)) return null;
    const major = extractSpringMajor(src);
    const bucket = major === void 0 ? null : nearestBucket(Number(major), SPRING_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/spring",
        category: "framework",
        name: "Spring Boot",
        version: major ? `${major}.x` : void 0,
        detectedBy: ctx.fileExists("pom.xml") ? "pom.xml" : "build.gradle"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
function buildToolRule(id, name, marker) {
  return {
    id,
    category: "buildTool",
    detect(ctx) {
      if (!ctx.fileExists(marker)) return null;
      return { id, category: "buildTool", name, detectedBy: marker };
    }
  };
}
var buildtoolNpm = buildToolRule("buildtool/npm", "npm", "package-lock.json");
var buildtoolMaven = buildToolRule("buildtool/maven", "Maven", "pom.xml");
var buildtoolPnpm = {
  id: "buildtool/pnpm",
  category: "buildTool",
  detect(ctx) {
    if (!ctx.fileExists("pnpm-lock.yaml")) return null;
    const major = packageManagerMajor(readPackageJson(ctx), "pnpm");
    const bucket = major === null ? null : nearestBucket(major, PNPM_BUCKETS);
    return withVersionBucket(
      {
        id: "buildtool/pnpm",
        category: "buildTool",
        name: "pnpm",
        version: major === null ? void 0 : String(major),
        detectedBy: "pnpm-lock.yaml"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
var buildtoolYarn = {
  id: "buildtool/yarn",
  category: "buildTool",
  detect(ctx) {
    if (!ctx.fileExists("yarn.lock")) return null;
    const major = packageManagerMajor(readPackageJson(ctx), "yarn");
    const berryConfig = ctx.fileExists(".yarnrc.yml");
    const label = major === null ? berryConfig ? "berry" : null : major >= 2 ? "berry" : "1.x";
    return withVersionBucket(
      {
        id: "buildtool/yarn",
        category: "buildTool",
        name: label === "berry" ? "Yarn (Berry)" : "Yarn",
        version: major === null ? void 0 : String(major),
        detectedBy: "yarn.lock"
      },
      label
    );
  }
};
var buildtoolGradle = {
  id: "buildtool/gradle",
  category: "buildTool",
  detect(ctx) {
    const marker = ["build.gradle", "build.gradle.kts"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    const wrapper = ctx.readFile("gradle/wrapper/gradle-wrapper.properties");
    const major = majorFromRange(wrapper?.match(/gradle-(\d+)\.[\d.]*-(?:bin|all)\.zip/)?.[1]);
    const bucket = major === null ? null : nearestBucket(major, GRADLE_BUCKETS);
    return withVersionBucket(
      {
        id: "buildtool/gradle",
        category: "buildTool",
        name: "Gradle",
        version: major === null ? void 0 : String(major),
        detectedBy: marker
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
var buildtoolPip = buildToolRule("buildtool/pip", "pip", "requirements.txt");
var buildtoolPoetry = {
  id: "buildtool/poetry",
  category: "buildTool",
  detect(ctx) {
    const src = ctx.readFile("pyproject.toml");
    if (!src || !src.includes("[tool.poetry]")) return null;
    const declared = majorFromRange(src.match(/requires-poetry\s*=\s*["'][^"']*?(\d+)/)?.[1]);
    const lockVersion = majorFromRange(ctx.readFile("poetry.lock")?.match(/lock-version\s*=\s*["'](\d+)/)?.[1]);
    const major = declared ?? (lockVersion !== null && lockVersion >= 2 ? 2 : null);
    const bucket = major === null ? null : nearestBucket(major, POETRY_BUCKETS);
    return withVersionBucket(
      {
        id: "buildtool/poetry",
        category: "buildTool",
        name: "Poetry",
        version: major === null ? void 0 : String(major),
        detectedBy: "pyproject.toml"
      },
      bucket === null ? null : `${bucket}.x`
    );
  }
};
function dataStoreRule(id, name, matchers) {
  return {
    id,
    category: "dataStore",
    detect(ctx) {
      const pkg = readPackageJson(ctx);
      const javaSrc = readJavaBuildFiles(ctx);
      const pySrc = readPythonFiles(ctx);
      if (!matchers(pkg, javaSrc, pySrc)) return null;
      return { id, category: "dataStore", name, detectedBy: "dependency-scan" };
    }
  };
}
var datastorePostgres = dataStoreRule(
  "datastore/postgres",
  "PostgreSQL",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "pg") || /postgresql/i.test(javaSrc) || /psycopg2/i.test(pySrc)
);
var datastoreMysql = dataStoreRule(
  "datastore/mysql",
  "MySQL",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "mysql", "mysql2") || /mysql-connector/i.test(javaSrc) || /(pymysql|mysqlclient)/i.test(pySrc)
);
var datastoreMongodb = dataStoreRule(
  "datastore/mongodb",
  "MongoDB",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "mongoose", "mongodb") || /mongodb-driver/i.test(javaSrc) || /pymongo/i.test(pySrc)
);
var datastoreRedis = dataStoreRule(
  "datastore/redis",
  "Redis",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "redis", "ioredis") || /(lettuce|jedis)/i.test(javaSrc) || /\bredis\b/i.test(pySrc)
);
var infraDocker = {
  id: "infra/docker",
  category: "infra",
  detect(ctx) {
    const marker = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    return { id: "infra/docker", category: "infra", name: "Docker", detectedBy: marker };
  }
};
var infraGithubActions = {
  id: "infra/github-actions",
  category: "infra",
  detect(ctx) {
    if (!ctx.fileExists(".github/workflows")) return null;
    return { id: "infra/github-actions", category: "infra", name: "GitHub Actions", detectedBy: ".github/workflows" };
  }
};
var ALL_RULES = [
  langTypescript,
  langJavascript,
  langJava,
  langPython,
  frameworkNode,
  frameworkReact,
  frameworkNextjs,
  frameworkExpress,
  frameworkSpring,
  buildtoolNpm,
  buildtoolYarn,
  buildtoolPnpm,
  buildtoolMaven,
  buildtoolGradle,
  buildtoolPip,
  buildtoolPoetry,
  datastorePostgres,
  datastoreMysql,
  datastoreMongodb,
  datastoreRedis,
  infraDocker,
  infraGithubActions
];
function flattenDetected(result) {
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

// src/harness/stackDetector.ts
function detectNodeCommands(ctx, buildToolIds) {
  const pkg = ctx.readJson("package.json");
  const scripts = pkg?.scripts ?? {};
  const runner = buildToolIds.includes("buildtool/pnpm") ? "pnpm" : buildToolIds.includes("buildtool/yarn") ? "yarn" : "npm run";
  const commands = {};
  if (scripts.build) commands.build = `${runner} build`;
  if (scripts.test) commands.test = `${runner} test`;
  if (scripts.format) commands.format = `${runner} format`;
  if (scripts.lint) commands.lint = `${runner} lint`;
  return commands;
}
function readBuildFileText(ctx, paths) {
  return paths.map((p) => ctx.readFile(p) ?? "").join("\n");
}
function detectGradleCommands(ctx, isWindows) {
  const hasBat = ctx.fileExists("gradlew.bat");
  const hasSh = ctx.fileExists("gradlew");
  const exe = isWindows && hasBat ? ".\\gradlew.bat" : hasSh ? "./gradlew" : "gradle";
  const buildFile = readBuildFileText(ctx, ["build.gradle", "build.gradle.kts"]);
  const lintTasks = [];
  if (/checkstyle/i.test(buildFile)) lintTasks.push("checkstyleMain");
  if (/spotbugs/i.test(buildFile)) lintTasks.push("spotbugsMain");
  return {
    build: `${exe} build`,
    test: `${exe} test`,
    ...lintTasks.length > 0 ? { lint: `${exe} ${lintTasks.join(" ")}` } : {}
  };
}
function detectMavenCommands(ctx, isWindows) {
  const hasCmd = ctx.fileExists("mvnw.cmd");
  const hasSh = ctx.fileExists("mvnw");
  const exe = isWindows && hasCmd ? "mvnw.cmd" : hasSh ? "./mvnw" : "mvn";
  const pom = ctx.readFile("pom.xml") ?? "";
  const lintGoals = [];
  if (pom.includes("maven-checkstyle-plugin")) lintGoals.push("checkstyle:check");
  if (pom.includes("spotbugs-maven-plugin")) lintGoals.push("spotbugs:check");
  return {
    build: `${exe} compile`,
    test: `${exe} test`,
    ...lintGoals.length > 0 ? { lint: `${exe} ${lintGoals.join(" ")}` } : {}
  };
}
function detectPythonCommands(ctx, buildToolIds) {
  if (!buildToolIds.includes("buildtool/pip") && !buildToolIds.includes("buildtool/poetry")) return {};
  const isPoetry = buildToolIds.includes("buildtool/poetry");
  const test = isPoetry ? "poetry run pytest" : "pytest";
  const pyproject = ctx.readFile("pyproject.toml") ?? "";
  const prefix = isPoetry ? "poetry run " : "";
  let lint;
  if (/\[tool\.ruff(\.|\])/.test(pyproject) || ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml")) {
    lint = `${prefix}ruff check .`;
  } else if (/\[tool\.flake8\]/.test(pyproject) || ctx.fileExists(".flake8") || /\[flake8\]/.test(ctx.readFile("setup.cfg") ?? "")) {
    lint = `${prefix}flake8`;
  }
  return { test, ...lint ? { lint } : {} };
}
function detectStack(projectPath, platform = process.platform) {
  const ctx = createFsDetectionContext(projectPath);
  const isWindows = platform === "win32";
  const languages = [];
  const frameworks = [];
  const dataStores = [];
  const buildTools = [];
  const infra = [];
  for (const rule of ALL_RULES) {
    const items = flattenDetected(rule.detect(ctx));
    for (const item of items) {
      switch (item.category) {
        case "language":
          languages.push(item);
          break;
        case "framework":
          frameworks.push(item);
          break;
        case "dataStore":
          dataStores.push(item);
          break;
        case "buildTool":
          buildTools.push(item);
          break;
        case "infra":
          infra.push(item);
          break;
      }
    }
  }
  const harnessIds = Array.from(
    new Set([...languages, ...frameworks, ...buildTools].map((item) => item.id))
  );
  const buildToolIds = buildTools.map((b) => b.id);
  const commands = {
    ...buildToolIds.some((id) => id.startsWith("buildtool/npm") || id.startsWith("buildtool/yarn") || id.startsWith("buildtool/pnpm")) ? detectNodeCommands(ctx, buildToolIds) : {},
    ...buildToolIds.includes("buildtool/gradle") ? detectGradleCommands(ctx, isWindows) : {},
    ...buildToolIds.includes("buildtool/maven") ? detectMavenCommands(ctx, isWindows) : {},
    ...detectPythonCommands(ctx, buildToolIds)
  };
  return { languages, frameworks, dataStores, buildTools, infra, harnessIds, commands };
}

// src/harness/installManifest.ts
import { mkdir as mkdir4, readFile as readFile3 } from "node:fs/promises";
import { dirname as dirname5, join as join6 } from "node:path";
import { createHash as createHash2 } from "node:crypto";
function fileBaseline(content) {
  return content === null ? { existed: false, byteLength: 0, sha256: null } : { existed: true, byteLength: Buffer.byteLength(content), sha256: createHash2("sha256").update(content).digest("hex") };
}
function installManifestPath(projectPath) {
  return join6(projectPath, "sugo", "install-manifest.json");
}
async function loadInstallManifest(projectPath) {
  return readFile3(installManifestPath(projectPath), "utf8").then((raw) => JSON.parse(raw), () => null);
}
async function saveInstallManifest(manifest) {
  const path = installManifestPath(manifest.projectPath);
  const content = `${JSON.stringify({ ...manifest, managedFiles: [...new Set(manifest.managedFiles)].sort() }, null, 2)}
`;
  const existing = await readFile3(path, "utf8").catch(() => null);
  if (existing === content) return;
  await mkdir4(dirname5(path), { recursive: true });
  await atomicWriteFile(path, content);
}

// src/harness/sync.ts
async function writeTextIfChanged(path, content) {
  const existing = await readFile4(path, "utf-8").catch(() => null);
  if (existing === content) return;
  await atomicWriteFile(path, content);
}
async function syncProjectHarness(args) {
  const { projectPath } = args;
  const sugoDir = projectSugoDir(projectPath);
  const rootClaudePath = join7(projectPath, "CLAUDE.md");
  const rootAgentsPath = join7(projectPath, "AGENTS.md");
  const existingManifest = await loadInstallManifest(projectPath);
  const manifest = existingManifest ? { ...existingManifest, projectPath } : {
    version: 1,
    projectPath,
    sugoDirExisted: await access(sugoDir).then(() => true, () => false),
    rootClaudeOriginal: fileBaseline(await readFile4(rootClaudePath, "utf8").catch(() => null)),
    rootAgentsOriginal: fileBaseline(await readFile4(rootAgentsPath, "utf8").catch(() => null)),
    managedFiles: []
  };
  const existingConfig = await loadProjectConfig(projectPath);
  const existingEntry = await findRegistryEntry(projectPath);
  const workspace = args.workspace ?? existingEntry?.workspace;
  const detectedStack = detectStack(projectPath);
  const harnessIds = Array.from(/* @__PURE__ */ new Set([...detectedStack.harnessIds, ...args.additionalStacks ?? []]));
  const libraryDir = defaultHarnessLibraryDir();
  const { harnesses, warnings: fetchWarnings } = fetchHarnesses({ harnessIds, libraryDir, overrideDir: userHarnessOverrideDir(), repoUrl: args.repoUrl });
  const projectName = basename(projectPath);
  const composeResult = compose({ harnesses, projectName, workspace, detectedStack, fetchWarnings });
  const claudeMdPath = join7(sugoDir, "CLAUDE.md");
  await mkdir5(sugoDir, { recursive: true });
  const existingClaudeMd = await readFile4(claudeMdPath, "utf-8").catch(() => null);
  const claudeMdResult = writeClaudeIfChanged(existingClaudeMd, composeResult.claudeMd, (/* @__PURE__ */ new Date()).toISOString());
  if (claudeMdResult.changed) await atomicWriteFile(claudeMdPath, claudeMdResult.content);
  for (const file of composeResult.harnessFiles) {
    const fullPath = join7(projectPath, file.relPath);
    await mkdir5(dirname6(fullPath), { recursive: true });
    await writeTextIfChanged(fullPath, file.content);
  }
  const claudeRulesDir = join7(projectPath, ".claude", "rules");
  await mkdir5(claudeRulesDir, { recursive: true });
  const effectiveRuleFiles = buildEffectiveClaudeRuleFiles(harnesses);
  for (const ruleFile of effectiveRuleFiles) {
    await writeTextIfChanged(join7(projectPath, ruleFile.relPath), ruleFile.content);
  }
  const currentRulePaths = new Set(effectiveRuleFiles.map((file) => file.relPath));
  const previousIds = existingConfig?.appliedHarnesses.map((h) => h.id) ?? [];
  for (const staleId of previousIds.filter((id) => !currentRulePaths.has(buildClaudeRuleFile(id, "").relPath))) {
    const stalePath = join7(projectPath, buildClaudeRuleFile(staleId, "").relPath);
    await unlink2(stalePath).catch(() => {
    });
  }
  const existingRootClaude = await readFile4(rootClaudePath, "utf-8").catch(() => null);
  const rootClaude = mergeRootClaudeReference(existingRootClaude, harnesses.map((h) => h.id));
  if (rootClaude.changed) await atomicWriteFile(rootClaudePath, rootClaude.content);
  const existingRootAgents = await readFile4(rootAgentsPath, "utf-8").catch(() => null);
  const rootAgents = mergeRootAgentsReference(existingRootAgents);
  if (rootAgents.changed) await atomicWriteFile(rootAgentsPath, rootAgents.content);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const candidateConfig = {
    version: "0.1.0",
    projectPath,
    projectName,
    registeredAt: existingConfig?.registeredAt ?? now,
    lastUpdated: now,
    detectedStack,
    appliedHarnesses: harnesses.map((h) => {
      const contentHash = hashHarnessContent(h);
      const previous = existingConfig?.appliedHarnesses.find(
        (item) => item.id === h.id && item.version === h.version && item.contentHash === contentHash
      );
      return { id: h.id, version: h.version, appliedAt: previous?.appliedAt ?? now, contentHash };
    }),
    autoCommitArtifacts: existingConfig?.autoCommitArtifacts ?? true,
    disabled: existingConfig?.disabled ?? false,
    verificationPolicy: args.integrationGateEnforced === void 0 && args.contractEvidenceRequired === void 0 ? existingConfig?.verificationPolicy : {
      ...existingConfig?.verificationPolicy,
      ...args.integrationGateEnforced !== void 0 && { integrationGateEnforced: args.integrationGateEnforced },
      ...args.contractEvidenceRequired !== void 0 && { contractEvidenceRequired: args.contractEvidenceRequired }
    }
  };
  const unchanged = existingConfig !== null && JSON.stringify({ ...candidateConfig, lastUpdated: existingConfig.lastUpdated }) === JSON.stringify(existingConfig);
  const config = unchanged ? existingConfig : candidateConfig;
  if (!unchanged) await saveProjectConfig(config);
  manifest.managedFiles = [
    ...manifest.managedFiles,
    "sugo/CLAUDE.md",
    "sugo/config.json",
    ...composeResult.harnessFiles.map((file) => file.relPath),
    ...effectiveRuleFiles.map((file) => file.relPath)
  ];
  await saveInstallManifest(manifest);
  await registerProject({ path: projectPath, name: projectName, registeredAt: config.registeredAt, workspace });
  return {
    projectName,
    workspace,
    composeResult,
    config,
    claudeMdPath,
    rootClaudeMdPath: rootClaudePath,
    rootAgentsMdPath: rootAgentsPath,
    claudeRulesFiles: harnesses.map((h) => buildClaudeRuleFile(h.id, "").relPath)
  };
}

// src/work/workspace.ts
import { mkdir as mkdir7, readdir, readFile as readFile7, rm } from "node:fs/promises";

// src/dashboard/config.ts
import { userInfo } from "node:os";
import { readFile as readFile5 } from "node:fs/promises";
import { join as join8 } from "node:path";
function settingsFilePath() {
  return join8(sugoHomeDir(), ".claude", "sugo", "settings.json");
}
function currentUsername() {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}
async function resolveDashboardConfig() {
  const envUrl = process.env.SUGO_DASHBOARD_API_URL;
  if (envUrl) {
    return {
      enabled: true,
      apiUrl: envUrl,
      userId: process.env.SUGO_DASHBOARD_USER_ID ?? currentUsername(),
      // 공개 SaaS 대시보드는 API 토큰이 필요하다(웹UI에서 발급→여기 붙여넣기). self-host/로컬은 생략 가능.
      apiToken: process.env.SUGO_DASHBOARD_API_TOKEN
    };
  }
  try {
    const raw = await readFile5(settingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw);
    const d = parsed.dashboard;
    if (d?.enabled && d.apiUrl) {
      return { enabled: true, apiUrl: d.apiUrl, userId: d.userId ?? currentUsername(), apiToken: d.apiToken };
    }
  } catch {
  }
  return { enabled: false };
}

// src/dashboard/retryQueue.ts
import { mkdir as mkdir6, readFile as readFile6 } from "node:fs/promises";

// src/work/storage.ts
import { join as join9 } from "node:path";
function workRootDir() {
  return join9(sugoHomeDir(), ".claude", "sugo", "work");
}
function workspaceDir(workspace) {
  return join9(workRootDir(), workspace);
}
function workspaceFilePath(workspace) {
  return join9(workspaceDir(workspace), "workspace.json");
}
function syncRetryQueuePath() {
  return join9(workRootDir(), "sync-retry-queue.json");
}
function syncRetryQueueLockPath() {
  return `${syncRetryQueuePath()}.lock`;
}

// src/dashboard/retryQueue.ts
import { dirname as dirname7 } from "node:path";
var MAX_RETRY_QUEUE_ITEMS = 100;
function discard(file, item, cause) {
  const reason = `${cause}: ${item.lastFailureReason ?? "unknown failure"}`;
  file.discardedCount = (file.discardedCount ?? 0) + 1;
  file.discardedReasons ??= {};
  file.discardedReasons[reason] = (file.discardedReasons[reason] ?? 0) + 1;
  console.warn(`[sugo] sync item discarded (${item.endpoint}): ${reason}`);
}
function failureFields(result) {
  return {
    status: result.permanent ? "permanent_failure" : "pending",
    lastHttpStatus: result.httpStatus,
    lastFailureReason: result.reason ?? "delivery failed",
    lastFailureAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function readQueueFile() {
  try {
    const raw = await readFile6(syncRetryQueuePath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { items: [] };
  }
}
async function writeQueueFile(file) {
  await mkdir6(dirname7(syncRetryQueuePath()), { recursive: true });
  await atomicWriteFile(syncRetryQueuePath(), JSON.stringify(file, null, 2));
}
async function enqueueRetry(endpoint, method, data, failure) {
  await withFileLock(syncRetryQueueLockPath(), async () => {
    const file = await readQueueFile();
    file.items.push({ endpoint, method, data, timestamp: (/* @__PURE__ */ new Date()).toISOString(), retryCount: 0, ...failure ? failureFields(failure) : {} });
    if (file.items.length > MAX_RETRY_QUEUE_ITEMS) {
      const removed = file.items.splice(0, file.items.length - MAX_RETRY_QUEUE_ITEMS);
      for (const item of removed) discard(file, item, "queue capacity exceeded");
    }
    await writeQueueFile(file);
  });
}

// src/dashboard/serialize.ts
function compactWorkResult(result, summaryOnly = false) {
  if (!result) return void 0;
  if (summaryOnly) {
    const { path, startedAt, endedAt, model, summary, parentTaskId, patchVersion, seed, runtimeVerified, wiringVerified, prRefs, sourceRevision } = result;
    const report = result.report ? {
      schemaVersion: result.report.schemaVersion,
      kind: result.report.kind,
      patchVersion: result.report.patchVersion,
      completionGrade: result.report.completionGrade,
      completedAt: result.report.completedAt,
      bypassLabels: result.report.bypassLabels,
      summary: result.report.summary,
      verification: result.report.verification,
      changedFiles: [],
      designDecisions: [],
      knownLimitations: []
    } : void 0;
    return { path, startedAt, endedAt, model, summary: summary ?? result.report?.summary, parentTaskId, patchVersion, seed, runtimeVerified, wiringVerified, prRefs, sourceRevision, report };
  }
  return {
    ...result,
    report: result.report ? { ...result.report, humanApprovals: void 0 } : void 0,
    files: result.files?.map((file) => {
      const { path, change, diff } = file;
      const lines = diff?.split("\n");
      return {
        path,
        change,
        ...lines ? {
          additions: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
          deletions: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length
        } : {
          ..."additions" in file && typeof file.additions === "number" ? { additions: file.additions } : {},
          ..."deletions" in file && typeof file.deletions === "number" ? { deletions: file.deletions } : {}
        }
      };
    })
  };
}
function compactRoadmapPayload(payload) {
  if (!payload || typeof payload !== "object" || !("nodes" in payload) || !Array.isArray(payload.nodes)) return payload;
  return { ...payload, nodes: payload.nodes.map((node) => ({
    ...node,
    workResult: compactWorkResult(node.workResult, node.level !== "task"),
    lineage: Array.isArray(node.lineage) ? node.lineage.map((entry) => ({
      ...entry,
      workResult: compactWorkResult(entry.workResult, true)
    })) : node.lineage
  })) };
}

// src/dashboard/schemaVersion.ts
var DASHBOARD_SYNC_SCHEMA_VERSION = 1;
var SYNC_SCHEMA_VERSION_HEADER = "x-sugo-sync-schema-version";

// src/dashboard/client.ts
var DEFAULT_TIMEOUT_MS = 5e3;
var MAX_ROADMAP_PAYLOAD_BYTES = 1024 * 1024;
function classifyHttpFailure(status) {
  return { ok: false, httpStatus: status, reason: `HTTP ${status}`, permanent: [400, 404, 405, 410, 413, 415, 422].includes(status) };
}
function withSchemaVersion(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return data;
  const obj = data;
  if (obj.schemaVersion !== void 0) return obj;
  return { ...obj, schemaVersion: DASHBOARD_SYNC_SCHEMA_VERSION };
}
var warnedNewerServer = false;
function noteServerSchemaVersion(res) {
  const raw = res.headers.get(SYNC_SCHEMA_VERSION_HEADER);
  if (!raw) return;
  const server = Number(raw);
  if (!Number.isInteger(server) || server <= DASHBOARD_SYNC_SCHEMA_VERSION || warnedNewerServer) return;
  warnedNewerServer = true;
  console.warn(
    `[sugo] \uB300\uC2DC\uBCF4\uB4DC sync \uACC4\uC57D\uC774 \uB354 \uCD5C\uC2E0\uC785\uB2C8\uB2E4(server=${server}, plugin=${DASHBOARD_SYNC_SCHEMA_VERSION}). \uD50C\uB7EC\uADF8\uC778 \uC5C5\uB370\uC774\uD2B8\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4 \u2014 \uB3D9\uAE30\uD654\uB294 \uACC4\uC18D \uC9C4\uD589\uD569\uB2C8\uB2E4.`
  );
}
async function sendOnce(apiUrl, endpoint, method, data, timeoutMs, apiToken) {
  const isRoadmap = endpoint === "/api/sync/roadmap" && method === "POST";
  const body = JSON.stringify(withSchemaVersion(isRoadmap ? compactRoadmapPayload(data) : data));
  if (isRoadmap && Buffer.byteLength(body, "utf8") > MAX_ROADMAP_PAYLOAD_BYTES) {
    return { ok: false, reason: "ROADMAP_PAYLOAD_TOO_LARGE (limit 1MiB)", permanent: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "Content-Type": "application/json" };
    if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    noteServerSchemaVersion(res);
    return res.ok ? { ok: true } : classifyHttpFailure(res.status);
  } catch {
    return { ok: false, reason: "network error or timeout" };
  } finally {
    clearTimeout(timer);
  }
}
async function pushEvent(endpoint, method, data, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return;
  const payload = withSchemaVersion(data);
  const ok = await sendOnce(config.apiUrl, endpoint, method, payload, timeoutMs, config.apiToken);
  if (!ok.ok) await enqueueRetry(endpoint, method, payload, ok);
}

// src/dashboard/workResultFiles.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);

// src/dashboard/sync.ts
async function syncWorkspace(ws) {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/workspace", "POST", {
    userId: config.userId,
    name: ws.name,
    projects: ws.projects,
    gitSyncedProjects: [],
    createdAt: ws.created_at,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// src/work/workspace.ts
async function loadWorkspace(name) {
  try {
    const raw = await readFile7(workspaceFilePath(name), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function ensureWorkspace(name, projectPath) {
  const existing = await loadWorkspace(name);
  const projects = new Set(existing?.projects ?? []);
  if (projectPath) projects.add(projectPath);
  const workspace = {
    name,
    projects: Array.from(projects),
    created_at: existing?.created_at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  await mkdir7(workspaceDir(name), { recursive: true });
  await atomicWriteFile(workspaceFilePath(name), JSON.stringify(workspace, null, 2));
  void syncWorkspace(workspace);
  return workspace;
}

// src/projectRegistration.ts
var PROJECT_MARKERS = /* @__PURE__ */ new Set([".git", "package.json", "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "composer.json", "Gemfile", "Makefile", "src"]);
async function assertProjectDirectory(projectPath) {
  const projectStat = await stat2(projectPath).catch(() => null);
  if (!projectStat?.isDirectory()) {
    throw Object.assign(new Error("\uD504\uB85C\uC81D\uD2B8 \uD3F4\uB354\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."), { code: "PROJECT_PATH_NOT_FOUND" });
  }
  const entries = await readdir2(projectPath).catch(() => []);
  if (!entries.some((entry) => PROJECT_MARKERS.has(entry))) {
    throw Object.assign(new Error("Git \uC800\uC7A5\uC18C, \uBE4C\uB4DC \uC124\uC815 \uB610\uB294 \uC18C\uC2A4 \uD3F4\uB354\uAC00 \uC788\uB294 \uD504\uB85C\uC81D\uD2B8\uB97C \uC120\uD0DD\uD558\uC138\uC694."), { code: "PROJECT_MARKER_NOT_FOUND" });
  }
}
async function assertProjectRegistrationAllowed() {
  const retainedData = join10(sugoHomeDir(), ".sugo", "data");
  if (await access2(retainedData).then(() => true, () => false)) {
    throw Object.assign(new Error("\uBE44\uD65C\uC131 \uBCF4\uAD00\uB41C Sugo \uB370\uC774\uD130\uC758 \uBCF5\uAD6C \uB610\uB294 \uD3D0\uAE30\uB97C \uBA3C\uC800 \uACB0\uC815\uD574\uC57C \uD569\uB2C8\uB2E4."), { code: "RETAINED_DATA_DECISION_REQUIRED" });
  }
}
async function registerSugoProject(input) {
  const projectPath = resolve2(input.projectPath);
  if (!/^[A-Za-z0-9._-]+$/.test(input.workspace) || input.workspace === "." || input.workspace === "..") {
    throw Object.assign(new Error("\uC0AC\uC6A9\uD560 \uC218 \uC5C6\uB294 \uB3C4\uBA54\uC778 \uC774\uB984\uC785\uB2C8\uB2E4."), { code: "INVALID_WORKSPACE_NAME" });
  }
  await assertProjectDirectory(projectPath);
  await assertProjectRegistrationAllowed();
  const result = await syncProjectHarness({ projectPath, workspace: input.workspace });
  await ensureWorkspace(input.workspace, projectPath);
  return {
    ok: true,
    projectPath,
    projectName: result.projectName,
    workspace: input.workspace,
    detectedStack: result.config.detectedStack,
    appliedHarnesses: result.composeResult.appliedHarnesses,
    warnings: result.composeResult.warnings
  };
}

// src/dashboardRegister.ts
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
try {
  const input = JSON.parse(await readStdin());
  process.stdout.write(JSON.stringify(await registerSugoProject(input)));
} catch (error) {
  process.stderr.write(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    code: typeof error === "object" && error && "code" in error ? String(error.code) : "PROJECT_REGISTRATION_FAILED"
  }));
  process.exitCode = 1;
}
