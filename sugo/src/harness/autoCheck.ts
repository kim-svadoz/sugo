import type { DetectionContext } from "./types.js";

/**
 * validation.yaml 체크의 `auto` 선언 — 서버가 직접 확인할 수 있는 체크를 기술한다.
 *
 * 하네스 규칙은 지금까지 전부 review-agent의 자기보고였다. 여기 선언된 체크만큼은 서버가 실측해,
 * §4.3의 런타임 게이트가 그랬듯 **자기보고보다 실측을 우선**한다. 외부 도구(ESLint/ruff 등)에
 * 의존하지 않고 결정적으로 판정 가능한 것만 대상으로 한다 — 판정이 흔들리면 게이트로 쓸 수 없다.
 */
export type AutoCheckSpec =
  | { kind: "file-exists"; paths: string[] }
  | { kind: "file-absent"; paths: string[] }
  | { kind: "file-content-absent"; paths: string[]; pattern: RegExp }
  | { kind: "changed-files-content-absent"; pattern: RegExp }
  | { kind: "json-field"; file: string; path: string; equals?: unknown; allowed?: unknown[] };

export interface AutoCheckResult {
  passed: boolean;
  /** 왜 그렇게 판정했는지 — 실패 시 어느 파일/값이 문제인지 밝힌다. */
  detail: string;
}

const KINDS = ["file-exists", "file-absent", "file-content-absent", "changed-files-content-absent", "json-field"] as const;

function requireNonEmptyPaths(raw: Record<string, unknown>): string[] {
  const paths = raw.paths;
  // 빈 paths는 file-exists에서 "전부 존재"가 공집합이라 무조건 통과가 된다 — 검증하는 척하는 체크.
  if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => typeof p === "string" && p.length > 0)) {
    throw new Error("auto.paths는 비어있지 않은 문자열 배열이어야 합니다.");
  }
  return paths as string[];
}

/**
 * 선언을 파싱한다. `auto`가 없으면 null(기존과 동일한 자기보고 체크).
 * 잘못된 선언은 **던진다** — 조용히 무시하면 "검증되는 줄 알았는데 아닌" 체크가 생긴다.
 */
export function parseAutoSpec(raw: unknown): AutoCheckSpec | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") throw new Error("auto는 객체여야 합니다.");
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;

  if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
    throw new Error(`알 수 없는 auto.kind: ${String(kind)} (지원: ${KINDS.join(", ")})`);
  }

  if (kind === "file-exists" || kind === "file-absent") {
    return { kind, paths: requireNonEmptyPaths(obj) };
  }

  if (kind === "file-content-absent") {
    const paths = requireNonEmptyPaths(obj);
    if (typeof obj.pattern !== "string" || obj.pattern.length === 0) {
      throw new Error("file-content-absent에는 pattern이 필요합니다.");
    }
    return { kind, paths, pattern: new RegExp(obj.pattern) }; // 깨진 정규식은 여기서 던진다
  }

  if (kind === "changed-files-content-absent") {
    // §P6-2: paths를 정적으로 받지 않는다 — 대상은 항상 "이번 세션에서 바뀐 파일"(ctx.changedFiles)이다.
    // no-secrets처럼 어떤 파일이 바뀔지 미리 알 수 없는 체크(하드코딩 시크릿은 아무 파일에나 생길 수
    // 있다)에 file-content-absent의 고정 paths는 쓸 수 없어서 이 kind가 필요했다.
    if (typeof obj.pattern !== "string" || obj.pattern.length === 0) {
      throw new Error("changed-files-content-absent에는 pattern이 필요합니다.");
    }
    // 대소문자 무시 — apiKey/API_KEY/Api-Key처럼 식별자 케이스가 다양해서, 여기서만 대소문자를
    // 구분하면 동일한 위반을 케이스 차이로 놓친다. file-content-absent(기존)는 의미가 달라(빌드
    // 스크립트의 고정 플래그 문자열 등) 대소문자 구분을 유지한다.
    return { kind, pattern: new RegExp(obj.pattern, "i") }; // 깨진 정규식은 여기서 던진다
  }

  const file = obj.file;
  const path = obj.path;
  if (typeof file !== "string" || file.length === 0) throw new Error("json-field에는 file이 필요합니다.");
  if (typeof path !== "string" || path.length === 0) throw new Error("json-field에는 path가 필요합니다.");
  const hasEquals = "equals" in obj;
  const allowed = obj.in;
  if (!hasEquals && !Array.isArray(allowed)) {
    throw new Error("json-field에는 비교 기준(equals 또는 in)이 필요합니다.");
  }
  // 남은 kind는 소거법으로 json-field뿐이다(위 KINDS 검사를 통과했고 나머지는 전부 반환했다).
  return { kind: "json-field", file, path, ...(hasEquals ? { equals: obj.equals } : {}), ...(Array.isArray(allowed) ? { allowed } : {}) };
}

function readDotPath(root: unknown, dotPath: string): { found: boolean; value: unknown } {
  let cur: unknown = root;
  for (const segment of dotPath.split(".")) {
    if (typeof cur !== "object" || cur === null || !(segment in (cur as Record<string, unknown>))) {
      return { found: false, value: undefined };
    }
    cur = (cur as Record<string, unknown>)[segment];
  }
  return { found: true, value: cur };
}

export function evaluateAutoCheck(spec: AutoCheckSpec, ctx: DetectionContext): AutoCheckResult {
  switch (spec.kind) {
    case "file-exists": {
      const missing = spec.paths.filter((p) => !ctx.fileExists(p));
      return missing.length === 0
        ? { passed: true, detail: `필요한 파일이 모두 있습니다: ${spec.paths.join(", ")}` }
        : { passed: false, detail: `없는 파일: ${missing.join(", ")}` };
    }
    case "file-absent": {
      const present = spec.paths.filter((p) => ctx.fileExists(p));
      return present.length === 0
        ? { passed: true, detail: `없어야 할 파일이 없습니다: ${spec.paths.join(", ")}` }
        : { passed: false, detail: `있으면 안 되는 파일: ${present.join(", ")}` };
    }
    case "file-content-absent": {
      // 대상 파일이 없으면 위반할 내용 자체가 없다 — 통과. (없는 걸 실패로 치면 무관한 스택에서 오탐)
      const hits = spec.paths.filter((p) => {
        const content = ctx.readFile(p);
        return content !== null && spec.pattern.test(content);
      });
      return hits.length === 0
        ? { passed: true, detail: `금지 패턴이 없습니다: /${spec.pattern.source}/` }
        : { passed: false, detail: `금지 패턴 /${spec.pattern.source}/ 발견: ${hits.join(", ")}` };
    }
    case "changed-files-content-absent": {
      // 대상 파일 목록이 아예 없으면(changedFiles:[]) 위반할 내용 자체가 없다 — 통과.
      const hits = ctx.changedFiles.filter((p) => {
        const content = ctx.readFile(p);
        return content !== null && spec.pattern.test(content);
      });
      return hits.length === 0
        ? { passed: true, detail: `변경 파일에 금지 패턴이 없습니다: /${spec.pattern.source}/` }
        : { passed: false, detail: `금지 패턴 /${spec.pattern.source}/ 발견: ${hits.join(", ")}` };
    }
    case "json-field": {
      const raw = ctx.readFile(spec.file);
      // 파일이 없거나 깨졌을 때 통과로 넘기면, 파일을 지우거나 망가뜨리는 것이 우회 수단이 된다.
      if (raw === null) return { passed: false, detail: `${spec.file}을(를) 읽을 수 없습니다.` };
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { passed: false, detail: `${spec.file} 파싱에 실패했습니다.` };
      }
      const { found, value } = readDotPath(parsed, spec.path);
      if (!found) return { passed: false, detail: `${spec.file}에 ${spec.path}가 없습니다.` };
      if (spec.allowed) {
        return spec.allowed.includes(value)
          ? { passed: true, detail: `${spec.path} = ${JSON.stringify(value)}` }
          : { passed: false, detail: `${spec.path} = ${JSON.stringify(value)} (허용: ${spec.allowed.map((v) => JSON.stringify(v)).join(", ")})` };
      }
      return value === spec.equals
        ? { passed: true, detail: `${spec.path} = ${JSON.stringify(value)}` }
        : { passed: false, detail: `${spec.path} = ${JSON.stringify(value)} (기대: ${JSON.stringify(spec.equals)})` };
    }
  }
}
