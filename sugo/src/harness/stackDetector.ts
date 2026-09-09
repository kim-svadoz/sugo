import { createFsDetectionContext } from "./context.js";
import { ALL_RULES, flattenDetected } from "./rules.js";
import type { DetectedItem, DetectedStack, DetectionContext } from "./types.js";

interface PackageJsonScripts {
  scripts?: Record<string, string>;
}

function detectNodeCommands(ctx: DetectionContext, buildToolIds: string[]): DetectedStack["commands"] {
  const pkg = ctx.readJson<PackageJsonScripts>("package.json");
  const scripts = pkg?.scripts ?? {};
  const runner = buildToolIds.includes("buildtool/pnpm")
    ? "pnpm"
    : buildToolIds.includes("buildtool/yarn")
      ? "yarn"
      : "npm run";
  const commands: DetectedStack["commands"] = {};
  if (scripts.build) commands.build = `${runner} build`;
  if (scripts.test) commands.test = `${runner} test`;
  if (scripts.format) commands.format = `${runner} format`;
  if (scripts.lint) commands.lint = `${runner} lint`;
  return commands;
}

function detectGradleCommands(ctx: DetectionContext, isWindows: boolean): DetectedStack["commands"] {
  const hasBat = ctx.fileExists("gradlew.bat");
  const hasSh = ctx.fileExists("gradlew");
  const exe = isWindows && hasBat ? ".\\gradlew.bat" : hasSh ? "./gradlew" : "gradle";
  return { build: `${exe} build`, test: `${exe} test` };
}

function detectMavenCommands(ctx: DetectionContext, isWindows: boolean): DetectedStack["commands"] {
  const hasCmd = ctx.fileExists("mvnw.cmd");
  const hasSh = ctx.fileExists("mvnw");
  const exe = isWindows && hasCmd ? "mvnw.cmd" : hasSh ? "./mvnw" : "mvn";
  return { build: `${exe} compile`, test: `${exe} test` };
}

function detectPythonCommands(buildToolIds: string[]): DetectedStack["commands"] {
  if (!buildToolIds.includes("buildtool/pip") && !buildToolIds.includes("buildtool/poetry")) return {};
  const runner = buildToolIds.includes("buildtool/poetry") ? "poetry run pytest" : "pytest";
  return { test: runner };
}

/**
 * 모든 DetectionRule을 실행해 카테고리별로 집계한다. dataStore/infra는 정보성으로만 채우고
 * harnessIds에는 넣지 않는다(§2 MVP 결정 — roadmap-progress.md 참조).
 * commands는 감지된 buildTool 조합으로 best-effort 추정한다(정확한 보장 없음).
 */
export function detectStack(projectPath: string, platform: NodeJS.Platform = process.platform): DetectedStack {
  const ctx = createFsDetectionContext(projectPath);
  // 래퍼 명령만 OS에 따라 갈린다(`.\gradlew.bat` vs `./gradlew`). 호스트 OS에서 반대편 분기를
  // 검증할 길이 없으면 "mac에서도 똑같이 도는지"를 영영 증명 못 하므로 주입 가능하게 뒀다.
  const isWindows = platform === "win32";

  const languages: DetectedItem[] = [];
  const frameworks: DetectedItem[] = [];
  const dataStores: DetectedItem[] = [];
  const buildTools: DetectedItem[] = [];
  const infra: DetectedItem[] = [];

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
    new Set([...languages, ...frameworks, ...buildTools].map((item) => item.id)),
  );

  const buildToolIds = buildTools.map((b) => b.id);
  const commands: DetectedStack["commands"] = {
    ...(buildToolIds.some((id) => id.startsWith("buildtool/npm") || id.startsWith("buildtool/yarn") || id.startsWith("buildtool/pnpm"))
      ? detectNodeCommands(ctx, buildToolIds)
      : {}),
    ...(buildToolIds.includes("buildtool/gradle") ? detectGradleCommands(ctx, isWindows) : {}),
    ...(buildToolIds.includes("buildtool/maven") ? detectMavenCommands(ctx, isWindows) : {}),
    ...detectPythonCommands(buildToolIds),
  };

  return { languages, frameworks, dataStores, buildTools, infra, harnessIds, commands };
}
