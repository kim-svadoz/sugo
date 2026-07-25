import type { DetectionContext, DetectionRule, DetectedItem } from "./types.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function readPackageJson(ctx: DetectionContext): PackageJson | null {
  return ctx.readJson<PackageJson>("package.json");
}

function depVersion(pkg: PackageJson | null, name: string): string | undefined {
  if (!pkg) return undefined;
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name];
}

function hasDep(pkg: PackageJson | null, ...names: string[]): boolean {
  return names.some((n) => depVersion(pkg, n) !== undefined);
}

function readJavaBuildFiles(ctx: DetectionContext): string {
  return [
    ctx.readFile("pom.xml"),
    ctx.readFile("build.gradle"),
    ctx.readFile("build.gradle.kts"),
  ]
    .filter((c): c is string => c !== null)
    .join("\n");
}

function readPythonFiles(ctx: DetectionContext): string {
  return [ctx.readFile("requirements.txt"), ctx.readFile("pyproject.toml")]
    .filter((c): c is string => c !== null)
    .join("\n");
}

function extractSpringMajor(javaSrc: string): string | undefined {
  // pom.xml: <spring-boot.version>3.2.4</spring-boot.version> 또는 parent artifactId=spring-boot-starter-parent의 <version>
  // build.gradle(.kts): id 'org.springframework.boot' version '3.2.4'
  const patterns = [
    /<spring-boot\.version>\s*(\d+)\.(\d+)\.(\d+)/,
    /spring-boot-starter-parent[\s\S]{0,200}?<version>\s*(\d+)\.(\d+)\.(\d+)/,
    /org\.springframework\.boot['"]\s*\)?\s*version\s*['"](\d+)\.(\d+)\.(\d+)/,
  ];
  for (const re of patterns) {
    const m = javaSrc.match(re);
    if (m) return m[1];
  }
  return undefined;
}

/** 언어 규칙: TypeScript는 tsconfig.json 존재를 기준으로, JavaScript는 tsconfig 없이 package.json만 있을 때 */
const langTypescript: DetectionRule = {
  id: "lang/typescript",
  category: "language",
  detect(ctx) {
    if (!ctx.fileExists("tsconfig.json")) return null;
    const pkg = readPackageJson(ctx);
    return {
      id: "lang/typescript",
      category: "language",
      name: "TypeScript",
      version: depVersion(pkg, "typescript"),
      detectedBy: "tsconfig.json",
    };
  },
};

const langJavascript: DetectionRule = {
  id: "lang/javascript",
  category: "language",
  detect(ctx) {
    if (!ctx.fileExists("package.json") || ctx.fileExists("tsconfig.json")) return null;
    return { id: "lang/javascript", category: "language", name: "JavaScript", detectedBy: "package.json" };
  },
};

const langJava: DetectionRule = {
  id: "lang/java",
  category: "language",
  detect(ctx) {
    const marker = ["pom.xml", "build.gradle", "build.gradle.kts"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    return { id: "lang/java", category: "language", name: "Java", detectedBy: marker };
  },
};

const langPython: DetectionRule = {
  id: "lang/python",
  category: "language",
  detect(ctx) {
    const marker = ["requirements.txt", "pyproject.toml"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    return { id: "lang/python", category: "language", name: "Python", detectedBy: marker };
  },
};

const frameworkNode: DetectionRule = {
  id: "framework/node",
  category: "framework",
  detect(ctx) {
    if (!ctx.fileExists("package.json")) return null;
    return { id: "framework/node", category: "framework", name: "Node.js", detectedBy: "package.json" };
  },
};

const frameworkReact: DetectionRule = {
  id: "framework/react",
  category: "framework",
  detect(ctx) {
    const pkg = readPackageJson(ctx);
    if (!hasDep(pkg, "react")) return null;
    return {
      id: "framework/react",
      category: "framework",
      name: "React",
      version: depVersion(pkg, "react"),
      detectedBy: "package.json:dependencies.react",
    };
  },
};

const frameworkExpress: DetectionRule = {
  id: "framework/express",
  category: "framework",
  detect(ctx) {
    const pkg = readPackageJson(ctx);
    if (!hasDep(pkg, "express")) return null;
    return {
      id: "framework/express",
      category: "framework",
      name: "Express",
      version: depVersion(pkg, "express"),
      detectedBy: "package.json:dependencies.express",
    };
  },
};

const frameworkSpring: DetectionRule = {
  id: "framework/spring",
  category: "framework",
  detect(ctx) {
    const src = readJavaBuildFiles(ctx);
    if (!src || !/spring-boot|org\.springframework\.boot/.test(src)) return null;
    const major = extractSpringMajor(src);
    return {
      id: major ? `framework/spring/${major}.x` : "framework/spring",
      category: "framework",
      name: "Spring Boot",
      version: major ? `${major}.x` : undefined,
      detectedBy: ctx.fileExists("pom.xml") ? "pom.xml" : "build.gradle",
    };
  },
};

function buildToolRule(id: string, name: string, marker: string): DetectionRule {
  return {
    id,
    category: "buildTool",
    detect(ctx) {
      if (!ctx.fileExists(marker)) return null;
      return { id, category: "buildTool", name, detectedBy: marker };
    },
  };
}

const buildtoolNpm = buildToolRule("buildtool/npm", "npm", "package-lock.json");
const buildtoolYarn = buildToolRule("buildtool/yarn", "Yarn", "yarn.lock");
const buildtoolPnpm = buildToolRule("buildtool/pnpm", "pnpm", "pnpm-lock.yaml");
const buildtoolMaven = buildToolRule("buildtool/maven", "Maven", "pom.xml");

const buildtoolGradle: DetectionRule = {
  id: "buildtool/gradle",
  category: "buildTool",
  detect(ctx) {
    const marker = ["build.gradle", "build.gradle.kts"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    return { id: "buildtool/gradle", category: "buildTool", name: "Gradle", detectedBy: marker };
  },
};

const buildtoolPip = buildToolRule("buildtool/pip", "pip", "requirements.txt");

const buildtoolPoetry: DetectionRule = {
  id: "buildtool/poetry",
  category: "buildTool",
  detect(ctx) {
    const src = ctx.readFile("pyproject.toml");
    if (!src || !src.includes("[tool.poetry]")) return null;
    return { id: "buildtool/poetry", category: "buildTool", name: "Poetry", detectedBy: "pyproject.toml" };
  },
};

/** dataStore/infra는 정보성 — harnessIds에는 포함되지 않음(§2 MVP 결정) */
function dataStoreRule(id: string, name: string, matchers: (pkg: PackageJson | null, javaSrc: string, pySrc: string) => boolean): DetectionRule {
  return {
    id,
    category: "dataStore",
    detect(ctx) {
      const pkg = readPackageJson(ctx);
      const javaSrc = readJavaBuildFiles(ctx);
      const pySrc = readPythonFiles(ctx);
      if (!matchers(pkg, javaSrc, pySrc)) return null;
      return { id, category: "dataStore", name, detectedBy: "dependency-scan" };
    },
  };
}

const datastorePostgres = dataStoreRule(
  "datastore/postgres",
  "PostgreSQL",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "pg") || /postgresql/i.test(javaSrc) || /psycopg2/i.test(pySrc),
);
const datastoreMysql = dataStoreRule(
  "datastore/mysql",
  "MySQL",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "mysql", "mysql2") || /mysql-connector/i.test(javaSrc) || /(pymysql|mysqlclient)/i.test(pySrc),
);
const datastoreMongodb = dataStoreRule(
  "datastore/mongodb",
  "MongoDB",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "mongoose", "mongodb") || /mongodb-driver/i.test(javaSrc) || /pymongo/i.test(pySrc),
);
const datastoreRedis = dataStoreRule(
  "datastore/redis",
  "Redis",
  (pkg, javaSrc, pySrc) => hasDep(pkg, "redis", "ioredis") || /(lettuce|jedis)/i.test(javaSrc) || /\bredis\b/i.test(pySrc),
);

const infraDocker: DetectionRule = {
  id: "infra/docker",
  category: "infra",
  detect(ctx) {
    const marker = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    return { id: "infra/docker", category: "infra", name: "Docker", detectedBy: marker };
  },
};

const infraGithubActions: DetectionRule = {
  id: "infra/github-actions",
  category: "infra",
  detect(ctx) {
    if (!ctx.fileExists(".github/workflows")) return null;
    return { id: "infra/github-actions", category: "infra", name: "GitHub Actions", detectedBy: ".github/workflows" };
  },
};

export const ALL_RULES: DetectionRule[] = [
  langTypescript,
  langJavascript,
  langJava,
  langPython,
  frameworkNode,
  frameworkReact,
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
  infraGithubActions,
];

export function flattenDetected(result: DetectedItem | DetectedItem[] | null): DetectedItem[] {
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}
