// Ported as-is (same algorithm, not copied source) from the plugin's
// sugo/src/hulk/roadmapGraph.ts so both sides of the seam agree on ordering.
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

// ─── 로드맵 진행 요약 + 이상징후(§C.3 RoadmapTab) ────────────────────────────
//
// 화면이 `const { counts, issues } = roadmap`으로 받는 두 값을 여기서 만든다. 프론트에서
// 세지 않고 서버가 세는 이유는 "진행 중심" 필터가 노드를 걸러낸 뒤에도 **전체 기준 진행률**이
// 흔들리면 안 되기 때문이다 — 필터는 보기이지 진척이 아니다.

export interface RoadmapCounts {
  total: number;
  pending: number;
  in_progress: number;
  done: number;
  blocked: number;
  verification?: number;
  dropped: number;
}

export interface RoadmapViewNode extends GraphNode {
  level: string;
  parent: string | null;
  title?: string;
  manualStatus?: string | null;
}

/** 사람이 수동으로 덮은 상태가 있으면 그게 우선(§3.3 manual_status). */
export function effectiveStatus(n: { status: string; manualStatus?: string | null }): string {
  return (n.manualStatus ?? n.status ?? "pending").toLowerCase();
}

/**
 * 진행률은 **task만** 센다(설계안: "roadmap count는 level='task'만").
 * spec/workstream은 그릇이고 subtask는 task 안의 세부라, 함께 세면 같은 일이 3번 세어진다.
 */
export function roadmapCounts(nodes: RoadmapViewNode[]): RoadmapCounts {
  const counts: RoadmapCounts = { total: 0, pending: 0, in_progress: 0, done: 0, blocked: 0, dropped: 0 };
  for (const n of nodes) {
    if (n.level !== "task") continue;
    counts.total++;
    const st = effectiveStatus(n);
    if (st === "verification") { counts.verification = (counts.verification ?? 0) + 1; continue; }
    if (st in counts) counts[st as keyof RoadmapCounts]++;
  }
  return counts;
}

/**
 * 화면 상단 빨간 경고에 그대로 찍히는 문장들. **그래프에서 실제로 확인되는 사실만** 담는다 —
 * 추측성 경고를 섞으면 사람이 경고를 안 읽게 되고, 그러면 진짜 사이클도 같이 묻힌다.
 */
export function roadmapIssues(nodes: RoadmapViewNode[]): string[] {
  const issues: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // ① 의존 사이클 — 순서를 확정할 수 없으므로 착수가능 판정 자체가 무의미해진다.
  const tasks = nodes.filter((n) => n.level === "task");
  const { cyclic, unknownDeps } = topoSort(tasks);
  if (cyclic) issues.push("의존 사이클이 있습니다 — 실행 순서를 확정할 수 없습니다.");
  if (unknownDeps.length > 0) {
    issues.push(`존재하지 않는 노드를 가리키는 의존 ${unknownDeps.length}건: ${unknownDeps.slice(0, 3).join(", ")}`);
  }

  // ② 끊어진 부모 — 캔버스에서 노드가 통째로 사라져 보인다(컨테이너를 못 찾으니 최상위로 튄다).
  const orphans = nodes.filter((n) => n.parent && !byId.has(n.parent));
  if (orphans.length > 0) {
    issues.push(`부모가 사라진 노드 ${orphans.length}건: ${orphans.slice(0, 3).map((n) => n.id).join(", ")}`);
  }

  // ③ 사용자 편집 link는 task↔task뿐이지만, 플러그인이 만드는 REQ 실행 체인은
  // 같은 task 아래 subtask/step→subtask도 정상이다. 두 계약을 혼동하면 정상 PRD마다 경고가 뜬다.
  const badLinks: string[] = [];
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      const to = byId.get(dep);
      if (!to) continue;
      const taskLink = n.level === "task" && to.level === "task";
      const requirementLink =
        (n.level === "subtask" || n.level === "step") &&
        to.level === "subtask" &&
        Boolean(n.parent) &&
        n.parent === to.parent;
      if (!taskLink && !requirementLink) badLinks.push(`${n.id}→${dep}`);
    }
  }
  if (badLinks.length > 0) {
    issues.push(`task가 아닌 노드에 걸린 의존 ${badLinks.length}건: ${badLinks.slice(0, 3).join(", ")}`);
  }

  // ④ 하위가 전부 done인데 자기는 안 닫힌 그릇 — 사람이 완료 처리만 하면 되는 상태.
  const doneKids = new Map<string, { total: number; done: number }>();
  for (const n of nodes) {
    if (!n.parent) continue;
    const acc = doneKids.get(n.parent) ?? { total: 0, done: 0 };
    acc.total++;
    if (effectiveStatus(n) === "done") acc.done++;
    doneKids.set(n.parent, acc);
  }
  const closable = nodes.filter((n) => {
    if (n.level !== "spec" && n.level !== "workstream") return false;
    if (effectiveStatus(n) === "done" || effectiveStatus(n) === "dropped") return false;
    const acc = doneKids.get(n.id);
    return !!acc && acc.total > 0 && acc.total === acc.done;
  });
  if (closable.length > 0) {
    issues.push(`하위가 전부 끝났는데 안 닫힌 항목 ${closable.length}건: ${closable.slice(0, 3).map((n) => n.title ?? n.id).join(", ")}`);
  }

  return issues;
}
