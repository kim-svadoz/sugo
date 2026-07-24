import type { DbClient } from "../db/client.js";

export interface PrRefs {
  baseUrl: string;
  projectKey: string;
  repoSlug: string;
  sourceBranch: string;
  targetBranch: string;
}

export type ResolveRefsResult = { ok: true; ref: PrRefs } | { ok: false; error: "NO_REFS" | "MULTI_BRANCH" };

export interface NodeRow {
  id: string;
  level: string;
  parent: string | null;
  work_result: string | null;
}

export function extractPrRefs(workResultJson: string | null): PrRefs | null {
  if (!workResultJson) return null;
  try {
    const parsed = JSON.parse(workResultJson) as { prRefs?: Partial<PrRefs> };
    const refs = parsed.prRefs;
    if (!refs || !refs.baseUrl || !refs.projectKey || !refs.repoSlug || !refs.sourceBranch) return null;
    return {
      baseUrl: refs.baseUrl,
      projectKey: refs.projectKey,
      repoSlug: refs.repoSlug,
      sourceBranch: refs.sourceBranch,
      targetBranch: refs.targetBranch ?? "develop",
    };
  } catch {
    return null;
  }
}

export function collectDescendantTaskIds(nodes: NodeRow[], rootId: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent) {
      if (!byParent.has(n.parent)) byParent.set(n.parent, []);
      byParent.get(n.parent)!.push(n.id);
    }
  }
  const result: string[] = [];
  const stack = [...(byParent.get(rootId) ?? [])];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (stack.length > 0) {
    const id = stack.pop()!;
    const node = byId.get(id);
    if (!node) continue;
    if (node.level === "task") result.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return result;
}

// §6 "scope 선택 PR": task=자기, run/spec=하위 task들. 브랜치 distinct 수집 ->
// 단일이면 OK, 여러 개면 MULTI_BRANCH, 하나도 없으면 NO_REFS.
export async function resolveRefs(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  scope: "task" | "run" | "spec"
): Promise<ResolveRefsResult> {
  const nodes = await db.query<NodeRow>(
    "SELECT id, level, parent, work_result FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName]
  );

  const candidateIds = scope === "task" ? [nodeId] : collectDescendantTaskIds(nodes, nodeId);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const refs: PrRefs[] = [];
  for (const id of candidateIds) {
    const ref = extractPrRefs(byId.get(id)?.work_result ?? null);
    if (ref) refs.push(ref);
  }

  if (refs.length === 0) return { ok: false, error: "NO_REFS" };

  const distinctBranches = new Set(refs.map((r) => r.sourceBranch));
  if (distinctBranches.size > 1) return { ok: false, error: "MULTI_BRANCH" };

  return { ok: true, ref: refs[0] };
}
