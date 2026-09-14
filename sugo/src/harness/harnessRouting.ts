/**
 * 변경 파일 → 관련 하네스 선택(§5). 적용된 하네스 전량을 항상 실어 보내면, 폴리글랏 저장소에서
 * `.java` 한 줄 고치는 에이전트가 Next.js 규칙까지 다 읽는다. 버전 분기가 생기면서 이 분량이
 * 두 배가 됐다.
 *
 * 좁히는 방향이 아니라 **넓히는 방향으로 안전**하게 설계한다 — 규칙이 과하게 들어오는 건 소음이지만
 * 빠지는 건 표준이 조용히 약해지는 것이다. 그래서 인식하지 못한 파일은 아무 것도 좁히지 않고,
 * 단 하나의 파일도 하네스와 연결되지 않으면 전량을 그대로 돌려준다.
 */

export interface HarnessRoutingResult {
  selected: string[];
  excluded: string[];
  /** 어떤 하네스와도 연결되지 않은 파일(소음 진단용 — 이것만으로 좁히지는 않는다) */
  unmatchedFiles: string[];
  /** 연결된 파일이 하나도 없어 전량을 그대로 반환했는지 */
  fellBackToAll: boolean;
}

const JAVA_PREFIXES = ["lang/java", "framework/spring"];
const NODE_PREFIXES = [
  "lang/typescript",
  "lang/javascript",
  "framework/node",
  "framework/react",
  "framework/nextjs",
  "framework/express",
];
const PYTHON_PREFIXES = ["lang/python"];

/** 확장자 → 언어 계열. 계열 안에서는 좁히지 않는다(`.ts` 하나로 node/react/next를 가려낼 수 없다). */
const PREFIXES_BY_EXTENSION: Record<string, string[]> = {
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
  ".pyi": PYTHON_PREFIXES,
};

/** 빌드 설정 파일 → 해당 빌드도구 + 그 언어 계열(빌드 파일이 언어 버전을 선언하는 자리이기도 하다). */
const PREFIXES_BY_FILENAME: Record<string, string[]> = {
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
  "pyproject.toml": ["buildtool/poetry", "buildtool/pip", ...PYTHON_PREFIXES],
};

/** 항상 적용되는 바닥 규칙 — 어떤 파일을 고치든 빠지면 안 된다(fetcher의 default 강제와 같은 이유). */
const ALWAYS_SELECTED = "default";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

function basenameOf(normalized: string): string {
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

function extensionOf(basename: string): string {
  const idx = basename.lastIndexOf(".");
  return idx <= 0 ? "" : basename.slice(idx);
}

function prefixesForFile(filePath: string): string[] | null {
  const normalized = normalizePath(filePath);
  const basename = basenameOf(normalized);

  const byName = PREFIXES_BY_FILENAME[basename];
  if (byName) return byName;
  // next.config.{js,mjs,ts} 처럼 접두어만 고정된 설정 파일
  if (basename.startsWith("next.config.")) return ["framework/nextjs", ...NODE_PREFIXES];
  if (/^requirements.*\.txt$/.test(basename)) return ["buildtool/pip", ...PYTHON_PREFIXES];

  const byExt = PREFIXES_BY_EXTENSION[extensionOf(basename)];
  return byExt ?? null;
}

/**
 * prefix 매칭은 경로 세그먼트 단위여야 한다. 단순 startsWith면 `lang/java`가 `lang/javascript`까지
 * 끌어온다 — 자바 파일을 고치는데 자바스크립트 규칙이 따라붙는다.
 */
function matchesPrefix(harnessId: string, prefix: string): boolean {
  return harnessId === prefix || harnessId.startsWith(`${prefix}/`);
}

/**
 * `.claude/rules/*.md`의 frontmatter `paths:` 글롭을 만든다. `PREFIXES_BY_EXTENSION`/
 * `PREFIXES_BY_FILENAME`을 그대로 뒤집어 쓴다 — 파일 라우팅과 자동로드 경로가 각자 다른 표를
 * 들고 있으면 둘이 서서히 어긋난다(한쪽만 고치고 잊는 사고). 커버되지 않는 id(예: `default`)는
 * 빈 배열 — 호출부가 이를 "항상 로드"(frontmatter 생략)로 해석한다.
 */
export function globsForHarnessId(harnessId: string): string[] {
  const globs = new Set<string>();

  for (const [ext, prefixes] of Object.entries(PREFIXES_BY_EXTENSION)) {
    if (prefixes.some((p) => matchesPrefix(harnessId, p))) globs.add(`**/*${ext}`);
  }
  for (const [filename, prefixes] of Object.entries(PREFIXES_BY_FILENAME)) {
    if (prefixes.some((p) => matchesPrefix(harnessId, p))) globs.add(`**/${filename}`);
  }
  // prefixesForFile의 특수 케이스(파일명 표에 없는 패턴 매칭)와 대응을 맞춘다.
  if (["framework/nextjs", ...NODE_PREFIXES].some((p) => matchesPrefix(harnessId, p))) {
    globs.add("**/next.config.*");
  }
  if (["buildtool/pip", ...PYTHON_PREFIXES].some((p) => matchesPrefix(harnessId, p))) {
    globs.add("**/requirements*.txt");
  }

  return [...globs].sort();
}

export function routeHarnessesForFiles(appliedIds: string[], changedFiles: string[]): HarnessRoutingResult {
  const prefixes = new Set<string>();
  const unmatchedFiles: string[] = [];

  for (const file of changedFiles) {
    const hit = prefixesForFile(file);
    if (hit === null) {
      unmatchedFiles.push(file);
      continue;
    }
    for (const p of hit) prefixes.add(p);
  }

  if (prefixes.size === 0) {
    return { selected: [...appliedIds], excluded: [], unmatchedFiles, fellBackToAll: true };
  }

  const selected: string[] = [];
  const excluded: string[] = [];
  for (const id of appliedIds) {
    const keep = id === ALWAYS_SELECTED || [...prefixes].some((p) => matchesPrefix(id, p));
    (keep ? selected : excluded).push(id);
  }
  return { selected, excluded, unmatchedFiles, fellBackToAll: false };
}
