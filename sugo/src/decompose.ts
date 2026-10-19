import { fail, ok, type GateCheckResult } from "./gates.js";

export type SubtaskStatus = "pending" | "in_progress" | "done";

export interface SubtaskManifestEntry {
  id: string;
  title: string;
  dependsOn: string[];
  files: string[];
  coversRequirements: string[];
  status: SubtaskStatus;
  changedFiles?: string[];
}

export interface DecomposeManifest {
  subtasks: SubtaskManifestEntry[];
}

/** DFS 기반 사이클 탐지. 발견한 첫 사이클을 id 배열로 반환(없으면 null). 존재하지 않는 의존 id는 무시. */
export function findManifestCycle(subtasks: SubtaskManifestEntry[]): string[] | null {
  const byId = new Map(subtasks.map((s) => [s.id, s]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string, path: string[]): string[] | null {
    if (visiting.has(id)) {
      const idx = path.indexOf(id);
      return path.slice(idx).concat(id);
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    path.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      const cycle = dfs(dep, path);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const s of subtasks) {
    if (!visited.has(s.id)) {
      const cycle = dfs(s.id, []);
      if (cycle) return cycle;
    }
  }
  return null;
}

export interface FileOverlap {
  file: string;
  subtaskIds: string[];
}

/** 여러 서브태스크가 같은 파일을 선언했는지 확인한다. decompose 시점엔 `files`(계획), integrate 시점엔 `changedFiles`(실제)로 각각 호출. */
export function detectFileOverlaps(subtasks: { id: string; files: string[] }[]): FileOverlap[] {
  const owners = new Map<string, string[]>();
  for (const s of subtasks) {
    for (const f of s.files) {
      const list = owners.get(f) ?? [];
      list.push(s.id);
      owners.set(f, list);
    }
  }
  const overlaps: FileOverlap[] = [];
  for (const [file, ids] of owners) {
    if (ids.length > 1) overlaps.push({ file, subtaskIds: ids });
  }
  return overlaps;
}

export interface RequirementCoverage {
  covered: string[];
  uncovered: string[];
}

/** 부모 PRD의 REQ-* 중 어떤 서브태스크도 coversRequirements로 선언하지 않은 것을 찾는다(역추적). */
export function computeRequirementCoverage(
  prdRequirementIds: string[],
  subtasks: { coversRequirements: string[] }[],
): RequirementCoverage {
  const coveredSet = new Set(subtasks.flatMap((s) => s.coversRequirements));
  const covered = prdRequirementIds.filter((id) => coveredSet.has(id));
  const uncovered = prdRequirementIds.filter((id) => !coveredSet.has(id));
  return { covered, uncovered };
}

/** decompose 매니페스트 결정론 검증기: 사이클 → 파일겹침(계획) → 요구커버리지 순으로 확인. */
export function validateManifest(manifest: DecomposeManifest, prdRequirementIds: string[]): GateCheckResult {
  const cycle = findManifestCycle(manifest.subtasks);
  if (cycle) {
    return fail("MANIFEST_HAS_CYCLE", `서브태스크 의존성에 사이클이 있습니다: ${cycle.join(" → ")}`);
  }

  const overlaps = detectFileOverlaps(manifest.subtasks);
  if (overlaps.length > 0) {
    return fail(
      "MANIFEST_FILE_OVERLAP",
      `여러 서브태스크가 같은 파일을 계획했습니다: ${overlaps.map((o) => `${o.file}(${o.subtaskIds.join(",")})`).join("; ")}`,
    );
  }

  const coverage = computeRequirementCoverage(prdRequirementIds, manifest.subtasks);
  if (coverage.uncovered.length > 0) {
    return fail("MANIFEST_REQUIREMENT_UNCOVERED", `어떤 서브태스크도 커버하지 않는 요구사항: ${coverage.uncovered.join(", ")}`);
  }

  return ok();
}

/** integrate 시점 재검증: 전 서브태스크 완료 + 실제 변경파일(계획이 아니라 changedFiles) 겹침 재확인. */
export function validateIntegration(manifest: DecomposeManifest): GateCheckResult {
  const incomplete = manifest.subtasks.filter((s) => s.status !== "done");
  if (incomplete.length > 0) {
    return fail("SUBTASKS_INCOMPLETE", `아직 완료되지 않은 서브태스크: ${incomplete.map((s) => s.id).join(", ")}`);
  }

  const overlaps = detectFileOverlaps(manifest.subtasks.map((s) => ({ id: s.id, files: s.changedFiles ?? [] })));
  if (overlaps.length > 0) {
    return fail(
      "MANIFEST_FILE_OVERLAP",
      `실제 변경파일이 겹칩니다: ${overlaps.map((o) => `${o.file}(${o.subtaskIds.join(",")})`).join("; ")}`,
    );
  }

  return ok();
}
