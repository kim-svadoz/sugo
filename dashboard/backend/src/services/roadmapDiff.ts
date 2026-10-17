// Pure functions for the roadmap sync "replace semantics + ownership boundary"
// contract. No IO here — src/services/syncService.ts
// does the actual DB work using these as the decision layer, so the ownership
// rules can be unit-tested without a database.

export interface ExistingRoadmapNode {
  id: string;
  level: string;
  dependsOn: string[];
}

// §7 "roadmap replace 시맨틱": payload에 없는 non-workstream 노드는 삭제,
// 수동 생성된 workstream 그룹은 payload에 없어도 보존한다.
export function computeNodesToDelete(
  existing: ExistingRoadmapNode[],
  incomingIds: ReadonlySet<string>
): string[] {
  return existing
    .filter((n) => n.level !== "workstream" && !n.id.startsWith("spec-manual-") && !incomingIds.has(n.id))
    .map((n) => n.id);
}

// 삭제된 노드를 가리키던 depends_on 참조를 청소(dangling dep 제거).
export function cleanDanglingDeps(dependsOn: string[], deletedIds: ReadonlySet<string>): string[] {
  return dependsOn.filter((id) => !deletedIds.has(id));
}

// §7 소유권 경계: depends_on(순서)은 대시보드 소유 — sync는 "비어있을 때만" seed.
// 신규 노드(existingDependsOn === undefined)는 항상 seed(최초 1회).
export function shouldSeedDependsOn(existingDependsOn: string[] | undefined): boolean {
  if (existingDependsOn === undefined) return true;
  return existingDependsOn.length === 0;
}
