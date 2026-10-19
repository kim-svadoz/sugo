import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessContent } from "./types.js";

const LOCAL_HARNESS_VERSION = "1.0.0-local";
export const DEFAULT_HARNESS_ID = "default";
export const HARNESS_FETCH_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * 원격(git) 하네스 저장소 fetch 쿨다운 판정 — 순수 함수, git 연동 붙기 전에도 미리 테스트 가능.
 * 로컬 fetch는 네트워크 비용이 없으므로 이 쿨다운을 적용하지 않는다.
 */
export function shouldSkipFetch(lastFetchAtMs: number | null, nowMs: number, cooldownMs = HARNESS_FETCH_COOLDOWN_MS): boolean {
  if (lastFetchAtMs === null) return false;
  return nowMs - lastFetchAtMs < cooldownMs;
}

/** "framework/spring/3.x" -> "framework/spring" 처럼 버전 접미사를 제거한 base id를 반환 */
function baseHarnessId(id: string): string | null {
  const parts = id.split("/");
  if (parts.length <= 2) return null;
  return parts.slice(0, 2).join("/");
}

function readHarnessDir(libraryDir: string, id: string, overrideDir?: string): { harnessMd: string; validationYaml: string } | null {
  const dir = join(libraryDir, id);
  const harnessPath = join(dir, "harness.md");
  const validationPath = join(dir, "validation.yaml");
  if (!existsSync(harnessPath) || !existsSync(validationPath)) return null;
  return {
    harnessMd: overrideDir && existsSync(join(overrideDir, id, "harness.md"))
      ? readFileSync(join(overrideDir, id, "harness.md"), "utf-8")
      : readFileSync(harnessPath, "utf-8"),
    validationYaml: overrideDir && existsSync(join(overrideDir, id, "validation.yaml"))
      ? readFileSync(join(overrideDir, id, "validation.yaml"), "utf-8")
      : readFileSync(validationPath, "utf-8"),
  };
}

export interface FetchResult {
  harnesses: HarnessContent[];
  warnings: string[];
}

/**
 * 로컬 하네스 라이브러리에서 harnessIds에 대응하는 콘텐츠를 읽는다.
 * id 정확매치 실패 시 버전 접미사를 제거한 base id로 재시도, 그래도 없으면 default로 폴백(차단 안 함).
 * default 자체가 없으면(라이브러리 손상) 예외를 던진다 — 이건 진짜 설치 문제라 숨기면 안 됨.
 */
export function fetchFromLocal(harnessIds: string[], libraryDir: string, overrideDir?: string): FetchResult {
  const harnesses: HarnessContent[] = [];
  const warnings: string[] = [];

  const idsToFetch = harnessIds.length > 0 ? harnessIds : [];

  for (const id of idsToFetch) {
    let hit = readHarnessDir(libraryDir, id, overrideDir);
    let resolvedId = id;
    let source: HarnessContent["source"] = "local";

    if (!hit) {
      const base = baseHarnessId(id);
      if (base) {
        hit = readHarnessDir(libraryDir, base, overrideDir);
        if (hit) resolvedId = base;
      }
    }

    if (!hit) {
      warnings.push(`하네스 id "${id}"에 대한 로컬 콘텐츠를 찾지 못해 default로 폴백합니다.`);
      hit = readHarnessDir(libraryDir, DEFAULT_HARNESS_ID, overrideDir);
      resolvedId = DEFAULT_HARNESS_ID;
      source = "default-fallback";
      if (!hit) {
        throw new Error(`로컬 하네스 라이브러리에 "${DEFAULT_HARNESS_ID}" 폴백 콘텐츠가 없습니다: ${libraryDir}`);
      }
    }

    if (harnesses.some((h) => h.id === resolvedId)) continue; // 중복 제거(예: 여러 id가 같은 base로 폴백)

    harnesses.push({
      id: resolvedId,
      version: LOCAL_HARNESS_VERSION,
      harnessMd: hit.harnessMd,
      validationYaml: hit.validationYaml,
      source,
    });
  }

  // 아무 것도 감지되지 않았어도 default는 항상 포함(모든 프로젝트에 최소 공통 규칙 적용)
  if (!harnesses.some((h) => h.id === DEFAULT_HARNESS_ID)) {
    const defaultHit = readHarnessDir(libraryDir, DEFAULT_HARNESS_ID, overrideDir);
    if (!defaultHit) {
      throw new Error(`로컬 하네스 라이브러리에 "${DEFAULT_HARNESS_ID}" 콘텐츠가 없습니다: ${libraryDir}`);
    }
    harnesses.unshift({
      id: DEFAULT_HARNESS_ID,
      version: LOCAL_HARNESS_VERSION,
      harnessMd: defaultHit.harnessMd,
      validationYaml: defaultHit.validationYaml,
      source: "local",
    });
  }

  return { harnesses, warnings };
}

export interface FetchHarnessesParams {
  harnessIds: string[];
  libraryDir: string;
  overrideDir?: string;
  repoUrl?: string;
}

/**
 * 하네스 fetch 진입점. repoUrl이 주어져도 git 연동은 아직 없어 경고만 남기고 로컬로
 * 폴백한다 — 차단하지 않는다.
 */
export function fetchHarnesses(params: FetchHarnessesParams): FetchResult {
  const result = fetchFromLocal(params.harnessIds, params.libraryDir, params.overrideDir);
  if (params.repoUrl) {
    result.warnings.unshift(
      `repoUrl(${params.repoUrl})이 지정되었지만 git 기반 하네스 fetch는 아직 구현되지 않았습니다. 로컬 하네스 라이브러리로 폴백합니다.`,
    );
  }
  return result;
}
