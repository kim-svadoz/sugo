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

/**
 * 감지된 버전을 지원 버킷 중 "그 이하의 가장 가까운 값"으로 내린다. 버킷보다 낮으면 null
 * (버전 하네스 없이 base만 적용). 새 버전이 나와도 규칙 수정 없이 최신 버킷으로 흡수된다 —
 * 모르는 상위 버전에 base만 주면 그 스택의 현대적 규칙이 통째로 빠지기 때문이다.
 */
function nearestBucket(value: number, buckets: readonly number[]): number | null {
  let hit: number | null = null;
  for (const b of buckets) if (value >= b) hit = b;
  return hit;
}

/** "^19.0.0", "~18.2", ">=19 <20", "19.1.0" 같은 범위 표기에서 major만 뽑는다. */
function majorFromRange(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * base 하네스와 버전 하네스를 함께 내보낸다. 버전 디렉터리만 내보내면 fetcher가 base로
 * 폴백하지 않고(정확매치가 성공하므로) 공통 규칙이 통째로 빠진다 — 버전 하네스는 델타이지
 * 대체가 아니다.
 */
function withVersionBucket(base: DetectedItem, bucket: string | null): DetectedItem[] {
  if (bucket === null) return [base];
  return [base, { ...base, id: `${base.id}/${bucket}`, version: bucket }];
}

const JAVA_BUCKETS = [8, 11, 17, 21, 25] as const;
const PYTHON_MINOR_BUCKETS = [9, 10, 12, 14] as const;
const REACT_BUCKETS = [18, 19] as const;
const NEXT_BUCKETS = [15, 16] as const;
const SPRING_BUCKETS = [2, 3, 4] as const;

/** pom.xml의 java.version/maven.compiler.*, build.gradle의 sourceCompatibility/toolchain에서 major 추출. */
function extractJavaMajor(javaSrc: string): number | null {
  const patterns = [
    /<java\.version>\s*(?:1\.)?(\d+)/,
    /<maven\.compiler\.release>\s*(?:1\.)?(\d+)/,
    /<maven\.compiler\.(?:source|target)>\s*(?:1\.)?(\d+)/,
    /<release>\s*(?:1\.)?(\d+)\s*<\/release>/,
    /JavaLanguageVersion\.of\(\s*['"]?(\d+)/,
    /(?:source|target)Compatibility\s*=?\s*['"]?(?:JavaVersion\.VERSION_)?(?:1[._])?(\d+)/,
    /options\.release\s*(?:\.set\()?\s*=?\s*['"]?(\d+)/,
  ];
  for (const re of patterns) {
    const m = javaSrc.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

/** pyproject.toml(requires-python/poetry python), .python-version, runtime.txt에서 3.x의 minor 추출. */
function extractPythonMinor(ctx: DetectionContext): number | null {
  const pyproject = ctx.readFile("pyproject.toml");
  if (pyproject) {
    const patterns = [
      /requires-python\s*=\s*["'][^"']*?3\.(\d+)/,
      /^\s*python\s*=\s*["'][^"']*?3\.(\d+)/m,
      /target-version\s*=\s*["']py3(\d+)["']/,
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
    const major = extractJavaMajor(readJavaBuildFiles(ctx));
    const bucket = major === null ? null : nearestBucket(major, JAVA_BUCKETS);
    return withVersionBucket(
      { id: "lang/java", category: "language", name: "Java", version: major ? String(major) : undefined, detectedBy: marker },
      bucket === null ? null : String(bucket),
    );
  },
};

const langPython: DetectionRule = {
  id: "lang/python",
  category: "language",
  detect(ctx) {
    const marker = ["requirements.txt", "pyproject.toml"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    const minor = extractPythonMinor(ctx);
    const bucket = minor === null ? null : nearestBucket(minor, PYTHON_MINOR_BUCKETS);
    return withVersionBucket(
      { id: "lang/python", category: "language", name: "Python", version: minor ? `3.${minor}` : undefined, detectedBy: marker },
      bucket === null ? null : `3.${bucket}`,
    );
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
    const major = majorFromRange(depVersion(pkg, "react"));
    const bucket = major === null ? null : nearestBucket(major, REACT_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/react",
        category: "framework",
        name: "React",
        version: depVersion(pkg, "react"),
        detectedBy: "package.json:dependencies.react",
      },
      bucket === null ? null : `${bucket}.x`,
    );
  },
};

const frameworkNextjs: DetectionRule = {
  id: "framework/nextjs",
  category: "framework",
  detect(ctx) {
    const pkg = readPackageJson(ctx);
    if (!hasDep(pkg, "next")) return null;
    const major = majorFromRange(depVersion(pkg, "next"));
    const bucket = major === null ? null : nearestBucket(major, NEXT_BUCKETS);
    // App Router와 Pages Router는 규칙이 갈리므로(서버컴포넌트 경계, async 요청 API) 어느 쪽인지 남긴다.
    const appRouter = ctx.fileExists("app") || ctx.fileExists("src/app");
    return withVersionBucket(
      {
        id: "framework/nextjs",
        category: "framework",
        name: appRouter ? "Next.js (App Router)" : "Next.js",
        version: depVersion(pkg, "next"),
        detectedBy: "package.json:dependencies.next",
      },
      bucket === null ? null : `${bucket}.x`,
    );
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
    const bucket = major === undefined ? null : nearestBucket(Number(major), SPRING_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/spring",
        category: "framework",
        name: "Spring Boot",
        version: major ? `${major}.x` : undefined,
        detectedBy: ctx.fileExists("pom.xml") ? "pom.xml" : "build.gradle",
      },
      bucket === null ? null : `${bucket}.x`,
    );
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
  infraGithubActions,
];

export function flattenDetected(result: DetectedItem | DetectedItem[] | null): DetectedItem[] {
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}
