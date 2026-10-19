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
const TYPESCRIPT_BUCKETS = [5, 6, 7] as const;
const NODE_BUCKETS = [20, 22, 24] as const;
const EXPRESS_BUCKETS = [4, 5] as const;
const GRADLE_BUCKETS = [8, 9] as const;
const PNPM_BUCKETS = [10, 12] as const;
const POETRY_BUCKETS = [1, 2] as const;

/**
 * Node 런타임 버전 근거를 우선순위대로 찾는다. engines가 계약이고 .nvmrc/.node-version은
 * 개발 환경 고정이라, 둘이 다르면 계약 쪽을 믿는다.
 */
function extractNodeMajor(ctx: DetectionContext, pkg: PackageJson | null): number | null {
  const engines = (pkg as { engines?: Record<string, string> } | null)?.engines?.node;
  const fromEngines = majorFromRange(engines);
  if (fromEngines !== null) return fromEngines;
  for (const file of [".nvmrc", ".node-version"]) {
    const raw = ctx.readFile(file);
    // "lts/jod" 같은 코드네임은 숫자가 없어 majorFromRange가 null을 준다 — 그때는 버전 하네스 없이 base만.
    const major = majorFromRange(raw?.trim());
    if (major !== null) return major;
  }
  return null;
}

/** `packageManager: "pnpm@12.0.0"` 필드에서 특정 도구의 major를 뽑는다(corepack 표준 표기). */
function packageManagerMajor(pkg: PackageJson | null, tool: string): number | null {
  const raw = (pkg as { packageManager?: string } | null)?.packageManager;
  if (!raw || !raw.startsWith(`${tool}@`)) return null;
  return majorFromRange(raw.slice(tool.length + 1));
}

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
    const declared = depVersion(pkg, "typescript");
    const bucket = nearestBucket(majorFromRange(declared) ?? -1, TYPESCRIPT_BUCKETS);
    return withVersionBucket(
      {
        id: "lang/typescript",
        category: "language",
        name: "TypeScript",
        version: declared,
        detectedBy: "tsconfig.json",
      },
      bucket === null ? null : `${bucket}.x`,
    );
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
    const pkg = readPackageJson(ctx);
    const major = extractNodeMajor(ctx, pkg);
    const bucket = major === null ? null : nearestBucket(major, NODE_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/node",
        category: "framework",
        name: "Node.js",
        version: major === null ? undefined : String(major),
        detectedBy: "package.json",
      },
      bucket === null ? null : `${bucket}.x`,
    );
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
    const declared = depVersion(pkg, "express");
    const bucket = nearestBucket(majorFromRange(declared) ?? -1, EXPRESS_BUCKETS);
    return withVersionBucket(
      {
        id: "framework/express",
        category: "framework",
        name: "Express",
        version: declared,
        detectedBy: "package.json:dependencies.express",
      },
      bucket === null ? null : `${bucket}.x`,
    );
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
const buildtoolMaven = buildToolRule("buildtool/maven", "Maven", "pom.xml");

const buildtoolPnpm: DetectionRule = {
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
        version: major === null ? undefined : String(major),
        detectedBy: "pnpm-lock.yaml",
      },
      bucket === null ? null : `${bucket}.x`,
    );
  },
};

const buildtoolYarn: DetectionRule = {
  id: "buildtool/yarn",
  category: "buildTool",
  detect(ctx) {
    if (!ctx.fileExists("yarn.lock")) return null;
    // Yarn 1(classic)과 2+(Berry)는 사실상 다른 도구다(PnP, 설치 명령, 설정 파일 전부 다름).
    // 숫자 버킷으로 두면 yarn 3이 1.x로 내려가 classic 규칙을 받는 사고가 나므로 라벨로 가른다.
    const major = packageManagerMajor(readPackageJson(ctx), "yarn");
    const berryConfig = ctx.fileExists(".yarnrc.yml");
    const label = major === null ? (berryConfig ? "berry" : null) : major >= 2 ? "berry" : "1.x";
    return withVersionBucket(
      {
        id: "buildtool/yarn",
        category: "buildTool",
        name: label === "berry" ? "Yarn (Berry)" : "Yarn",
        version: major === null ? undefined : String(major),
        detectedBy: "yarn.lock",
      },
      label,
    );
  },
};

const buildtoolGradle: DetectionRule = {
  id: "buildtool/gradle",
  category: "buildTool",
  detect(ctx) {
    const marker = ["build.gradle", "build.gradle.kts"].find((f) => ctx.fileExists(f));
    if (!marker) return null;
    // 실제로 빌드를 도는 건 래퍼가 내려받는 배포본이라 wrapper properties가 가장 정확한 근거다.
    const wrapper = ctx.readFile("gradle/wrapper/gradle-wrapper.properties");
    const major = majorFromRange(wrapper?.match(/gradle-(\d+)\.[\d.]*-(?:bin|all)\.zip/)?.[1]);
    const bucket = major === null ? null : nearestBucket(major, GRADLE_BUCKETS);
    return withVersionBucket(
      {
        id: "buildtool/gradle",
        category: "buildTool",
        name: "Gradle",
        version: major === null ? undefined : String(major),
        detectedBy: marker,
      },
      bucket === null ? null : `${bucket}.x`,
    );
  },
};

const buildtoolPip = buildToolRule("buildtool/pip", "pip", "requirements.txt");

const buildtoolPoetry: DetectionRule = {
  id: "buildtool/poetry",
  category: "buildTool",
  detect(ctx) {
    const src = ctx.readFile("pyproject.toml");
    if (!src || !src.includes("[tool.poetry]")) return null;
    // Poetry 버전은 프로젝트 파일에 직접 안 적힌다. 명시 신호(requires-poetry, lock의 lock-version)가
    // 있을 때만 버킷을 잡고, 없으면 base만 — 추측으로 버전 규칙을 씌우면 틀린 규칙을 강제하게 된다.
    const declared = majorFromRange(src.match(/requires-poetry\s*=\s*["'][^"']*?(\d+)/)?.[1]);
    const lockVersion = majorFromRange(ctx.readFile("poetry.lock")?.match(/lock-version\s*=\s*["'](\d+)/)?.[1]);
    const major = declared ?? (lockVersion !== null && lockVersion >= 2 ? 2 : null);
    const bucket = major === null ? null : nearestBucket(major, POETRY_BUCKETS);
    return withVersionBucket(
      {
        id: "buildtool/poetry",
        category: "buildTool",
        name: "Poetry",
        version: major === null ? undefined : String(major),
        detectedBy: "pyproject.toml",
      },
      bucket === null ? null : `${bucket}.x`,
    );
  },
};

/** dataStore/infra는 정보성 — harnessIds에는 포함되지 않음 */
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
