// Ported as-is (same algorithm, not copied source) from the plugin's
// sugo/src/hulk/canvasGraph.ts so both sides of the seam agree on ordering.
// See spec/sugo-dashboard-spec-v1.md 설계안 "캔버스 DAG 규칙 (플러그인과 알고리즘 동일)".

export interface GraphNode {
  id: string;
  dependsOn: string[];
  status: string;
}

export interface TopoSortResult {
  order: string[];
  cyclic: boolean;
  unknownDeps: string[];
}

// Kahn 알고리즘, 같은 in-degree 노드가 여럿이면 알파벳 순으로 뽑아 결정론 보장.
// 사이클이 있으면 cyclic:true(부분 order만). 존재하지 않는 의존 id는 unknownDeps로 보고.
export function topoSort(nodes: GraphNode[]): TopoSortResult {
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

// pending 노드 중 모든 의존성이 done인 것만. 미지의 의존 id는 "완료 아님"으로 안전측 처리.
export function readySet(nodes: GraphNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result: string[] = [];
  for (const n of nodes) {
    if (n.status !== "pending") continue;
    const allDepsDone = n.dependsOn.every((dep) => byId.get(dep)?.status === "done");
    if (allDepsDone) result.push(n.id);
  }
  return result;
}

// DFS: toId가 이미 (직접/간접으로) fromId에 의존하는지 - true면 fromId->toId 새 엣지가 사이클을 만든다.
export function wouldCreateCycle(nodes: GraphNode[], fromId: string, toId: string): boolean {
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
