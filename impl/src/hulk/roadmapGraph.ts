import type { RoadmapNode } from "./types.js";

export interface TopoSortResult {
  order: string[];
  cyclic: boolean;
  unknownDeps: string[];
}

/**
 * Kahn 알고리즘 기반 위상정렬. 같은 in-degree(준비상태) 노드가 여럿이면 알파벳 순으로 뽑아
 * 결정론을 보장한다(§8.5). 사이클이 있으면 cyclic:true(부분 order만 반환). 존재하지 않는
 * 의존 id는 unknownDeps로 보고하고 in-degree 계산에서는 무시한다(§8.5 wouldCreateCycle과 별개).
 */
export function topoSort(nodes: RoadmapNode[]): TopoSortResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const unknownDeps = new Set<string>();
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    dependents.set(n.id, []);
  }
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (!byId.has(dep)) {
        unknownDeps.add(dep);
        continue;
      }
      inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
      dependents.get(dep)!.push(n.id);
    }
  }

  const ready = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);
  ready.sort();
  const order: string[] = [];

  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    const newlyReady: string[] = [];
    for (const dependentId of dependents.get(id) ?? []) {
      const remaining = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, remaining);
      if (remaining === 0) newlyReady.push(dependentId);
    }
    if (newlyReady.length > 0) {
      ready.push(...newlyReady);
      ready.sort();
    }
  }

  return { order, cyclic: order.length < nodes.length, unknownDeps: [...unknownDeps].sort() };
}

/**
 * 후보(pending) 노드 중 모든 의존성이 done인 것만 골라낸다(§8.5). 미지의 의존 id는
 * "완료 아님"으로 안전측 처리한다 — 실제로 완료됐는지 확인할 길이 없는데 ready로 잘못
 * 판정하면 순서강제가 뚫리기 때문이다.
 */
export function readySet(nodes: RoadmapNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result: string[] = [];
  for (const n of nodes) {
    if (n.status !== "pending") continue;
    const allDepsDone = n.dependsOn.every((dep) => byId.get(dep)?.status === "done");
    if (allDepsDone) result.push(n.id);
  }
  return result;
}

/** DFS로 toId가 이미 fromId에 (직접/간접으로) 의존하는지 확인한다 — true면 fromId가 toId에 의존하는
 * 새 엣지를 추가할 때 사이클이 생긴다. 자기 자신에 대한 의존(fromId===toId)도 사이클로 취급한다. */
export function wouldCreateCycle(nodes: RoadmapNode[], fromId: string, toId: string): boolean {
  if (fromId === toId) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();

  function dependsOnFrom(id: string): boolean {
    if (id === fromId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (dependsOnFrom(dep)) return true;
    }
    return false;
  }

  return dependsOnFrom(toId);
}
