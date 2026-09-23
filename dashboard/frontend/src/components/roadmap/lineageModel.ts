import type { RoadmapNode } from "../../hooks/useRoadmap.js";

type HistoryRequirement = { id?: unknown; title?: unknown; status?: unknown };
type HistoryEntry = {
  version?: unknown;
  title?: unknown;
  summary?: unknown;
  changedFiles?: unknown;
  workResult?: unknown;
  requirements?: unknown;
};
type LegacyLineage = { root?: unknown; depth?: unknown; version?: unknown };

export type LineageChainItem = {
  key: string;
  node: RoadmapNode;
  depth: number;
  version: number;
  title: string;
  entry: HistoryEntry;
};

export type LineageChain = {
  id: string;
  root: string;
  parent: string | null;
  memberIds: string[];
  columns: LineageChainItem[][];
};

const numberOr = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Canvas contract: only TASKs may become patch lineage nodes. A RUN owns the task/chain and must
 * always remain a visible container. Current Sugo stores chronological history as an array on one
 * task; the legacy object shape is retained for already-synced dashboards.
 */
export function buildLineageChains(nodes: RoadmapNode[]): LineageChain[] {
  const groups = new Map<string, LineageChainItem[]>();

  for (const node of nodes) {
    if (node.level !== "task") continue;
    if (Array.isArray(node.lineage)) {
      const entries = node.lineage.filter((entry): entry is HistoryEntry => !!entry && typeof entry === "object");
      if (entries.length === 0) continue;
      const items = entries
        .map((entry, index) => {
          const version = numberOr(entry.version, index);
          return {
            key: `${node.id}:v${version}`,
            node,
            depth: index,
            version,
            title: typeof entry.title === "string" && entry.title ? entry.title : node.title,
            entry,
          };
        })
        .sort((a, b) => a.version - b.version);
      groups.set(node.id, items);
      continue;
    }

    if (!node.lineage || typeof node.lineage !== "object") continue;
    const legacy = node.lineage as LegacyLineage;
    const root = typeof legacy.root === "string" && legacy.root ? legacy.root : node.id;
    const version = numberOr(legacy.version, 0);
    groups.set(root, [
      ...(groups.get(root) ?? []),
      {
        key: node.id,
        node,
        depth: numberOr(legacy.depth, 0),
        version,
        title: node.title,
        entry: legacy,
      },
    ]);
  }

  return [...groups.entries()].map(([root, unsorted]) => {
    const items = [...unsorted].sort((a, b) => a.version - b.version);
    const columns: LineageChainItem[][] = [];
    for (const item of items) {
      if (item.depth === 0 || columns.length === 0) columns.push([item]);
      else columns[columns.length - 1].push(item);
    }
    return {
      id: `chain:${root}`,
      root,
      parent: items[0].node.parent,
      memberIds: [...new Set(items.map((item) => item.node.id))],
      columns,
    };
  });
}

const requirementNodes = (item: LineageChainItem): RoadmapNode[] => {
  if (!Array.isArray(item.entry.requirements)) return [];
  return item.entry.requirements
    .filter((value): value is HistoryRequirement => !!value && typeof value === "object")
    .map((req, index) => ({
      id: `${item.key}::${typeof req.id === "string" ? req.id : `REQ-${index + 1}`}`,
      title: typeof req.title === "string" ? req.title : `REQ-${index + 1}`,
      level: "subtask",
      status: typeof req.status === "string" ? req.status : "done",
      depends_on: [],
      parent: item.key,
      ref: null,
      note: null,
      spec_path: null,
      work_result: null,
      lineage: null,
      manual_status: null,
      pos_x: null,
      pos_y: null,
    }));
};

/** 클릭한 feat/patch 카드 한 장을 Inspector가 소비할 독립 TASK 뷰로 만든다. */
export function lineageSelection(item: LineageChainItem, fallbackReqs: RoadmapNode[]) {
  const explicitWorkResult = item.entry.workResult && typeof item.entry.workResult === "object"
    ? item.entry.workResult
    : null;
  const changedFiles = Array.isArray(item.entry.changedFiles)
    ? item.entry.changedFiles.filter((value): value is string => typeof value === "string")
    : [];
  const fallbackWorkResult = {
    summary: typeof item.entry.summary === "string" ? item.entry.summary : undefined,
    files: changedFiles.map((path) => ({ path, change: "modified" as const })),
    patchVersion: item.version,
  };
  const reqs = requirementNodes(item);
  const node: RoadmapNode = {
    ...item.node,
    id: item.key,
    title: `v${item.version} ${item.version === 0 ? "feat" : "patch"} · ${item.title}`,
    work_result: explicitWorkResult ?? fallbackWorkResult,
    lineage: null,
  };
  return { node, reqs: reqs.length > 0 ? reqs : fallbackReqs };
}
