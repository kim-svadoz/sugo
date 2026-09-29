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

/** 빌드파일(build.gradle/build.gradle.kts 또는 pom.xml) 본문을 합쳐 읽는다 — 플러그인 존재 여부만
 * 확인할 것이므로 파싱은 안 하고 문자열 포함 검사로 충분하다(§P6-3: 추측 금지, 명시 신호만). */
function readBuildFileText(ctx: DetectionContext, paths: string[]): string {
  return paths.map((p) => ctx.readFile(p) ?? "").join("\n");
}

function detectGradleCommands(ctx: DetectionContext, isWindows: boolean): DetectedStack["commands"] {
  const hasBat = ctx.fileExists("gradlew.bat");
  const hasSh = ctx.fileExists("gradlew");
  const exe = isWindows && hasBat ? ".\\gradlew.bat" : hasSh ? "./gradlew" : "gradle";
  const buildFile = readBuildFileText(ctx, ["build.gradle", "build.gradle.kts"]);
  // §P6-3: checkstyle/spotbugs 플러그인이 실제로 적용돼 있을 때만 태스크를 제안한다 — 플러그인
  // 없이 `checkstyleMain`을 부르면 태스크가 없어 매번 실패하는 게 확실하다(추측 금지 원칙).
  const lintTasks: string[] = [];
  if (/checkstyle/i.test(buildFile)) lintTasks.push("checkstyleMain");
  if (/spotbugs/i.test(buildFile)) lintTasks.push("spotbugsMain");
  return {
    build: `${exe} build`,
    test: `${exe} test`,
    ...(lintTasks.length > 0 ? { lint: `${exe} ${lintTasks.join(" ")}` } : {}),
  };
}

function detectMavenCommands(ctx: DetectionContext, isWindows: boolean): DetectedStack["commands"] {
  const hasCmd = ctx.fileExists("mvnw.cmd");
  const hasSh = ctx.fileExists("mvnw");
  const exe = isWindows && hasCmd ? "mvnw.cmd" : hasSh ? "./mvnw" : "mvn";
  const pom = ctx.readFile("pom.xml") ?? "";
  const lintGoals: string[] = [];
  if (pom.includes("maven-checkstyle-plugin")) lintGoals.push("checkstyle:check");
  if (pom.includes("spotbugs-maven-plugin")) lintGoals.push("spotbugs:check");
  return {
    build: `${exe} compile`,
    test: `${exe} test`,
    ...(lintGoals.length > 0 ? { lint: `${exe} ${lintGoals.join(" ")}` } : {}),
  };
}

function detectPythonCommands(ctx: DetectionContext, buildToolIds: string[]): DetectedStack["commands"] {
  if (!buildToolIds.includes("buildtool/pip") && !buildToolIds.includes("buildtool/poetry")) return {};
  const isPoetry = buildToolIds.includes("buildtool/poetry");
  const test = isPoetry ? "poetry run pytest" : "pytest";
  const pyproject = ctx.readFile("pyproject.toml") ?? "";
  const prefix = isPoetry ? "poetry run " : "";
  // ruff를 flake8보다 우선한다 — 둘 다 설정돼 있으면 ruff가 더 빠르고 최신 기본값에 가깝다.
  let lint: string | undefined;
  if (/\[tool\.ruff(\.|\])/.test(pyproject) || ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml")) {
    lint = `${prefix}ruff check .`;
  } else if (/\[tool\.flake8\]/.test(pyproject) || ctx.fileExists(".flake8") || /\[flake8\]/.test(ctx.readFile("setup.cfg") ?? "")) {
    lint = `${prefix}flake8`;
  }
  return { test, ...(lint ? { lint } : {}) };
}

/**
 * 모든 DetectionRule을 실행해 카테고리별로 집계한다. dataStore/infra는 정보성으로만 채우고
 * harnessIds에는 넣지 않는다(§2).
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
    ...detectPythonCommands(ctx, buildToolIds),
  };

  return { languages, frameworks, dataStores, buildTools, infra, harnessIds, commands };
}
