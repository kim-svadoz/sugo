import type { RoadmapNode } from "../../hooks/useRoadmap.js";
import { repositoryRelativePath } from "./fileViewerModel.js";

type HistoryRequirement = { id?: unknown; title?: unknown; status?: unknown; covered?: boolean };
type HistoryReport = { requirements?: unknown };
type HistoryEntry = {
  version?: unknown;
  title?: unknown;
  seed?: unknown;
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

const conciseTitle = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return null;
  const normalized = firstLine
    .replace(/^(?:v?\d+\s*(?:차\s*)?patch)\s*[:·-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? normalized;
};

const lineageEntryTitle = (entry: HistoryEntry, taskTitle: string): string => {
  const stored = conciseTitle(entry.title);
  const version = numberOr(entry.version, 0);
  if (version === 0 && stored) return stored;
  if (stored && stored !== taskTitle) return stored;
  const requirementTitle = Array.isArray(entry.requirements)
    ? entry.requirements
      .map((requirement) => conciseTitle(requirement?.title)?.replace(/\s*\(TODO-SPEC 항목:[^)]+\)\s*$/, "").trim())
      .find((title) => title && title !== "사용자 최종 확인")
    : null;
  const workResult = entry.workResult && typeof entry.workResult === "object"
    ? entry.workResult as { seed?: unknown; summary?: unknown; report?: { summary?: unknown } }
    : null;
  return requirementTitle
    ?? conciseTitle(workResult?.seed)
    ?? conciseTitle(workResult?.summary)
    ?? conciseTitle(workResult?.report?.summary)
    ?? stored
    ?? taskTitle;
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
      const latestVersion = Math.max(...entries.map((entry, index) => numberOr(entry.version, index)));
      const items = entries
        .map((entry, index) => {
          const version = numberOr(entry.version, index);
          const cancelledPatch = version === latestVersion
            && node.runtime_assessment?.status === "cancelled"
            && !(entry.workResult && typeof entry.workResult === "object");
          return {
            key: `${node.id}:v${version}`,
            node: version < latestVersion
              ? { ...node, status: "done", display_status: "done", manual_status: null, human_blocker: null, blocker_decision: null, runtime_assessment: null, note: null, approval_read_only: true }
              : cancelledPatch
                ? { ...node, status: "dropped", display_status: "dropped" }
                : node,
            depth: index,
            version,
            title: lineageEntryTitle(entry, node.title),
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

  return [...groups.entries()].flatMap(([root, unsorted]) => {
    const items = [...unsorted].sort((a, b) => a.version - b.version);
    // v0은 최초 feat의 실행 기록일 뿐, 그 자체로는 "계보"가 아니다. 실제 patch가 하나라도
    // 생겼을 때만 일반 TASK 카드를 체인 노드로 승격한다.
    if (!items.some((item) => item.version > 0)) return [];
    const columns: LineageChainItem[][] = [];
    for (const item of items) {
      if (item.depth === 0 || columns.length === 0) columns.push([item]);
      else columns[columns.length - 1].push(item);
    }
    return [{
      id: `chain:${root}`,
      root,
      parent: items[0].node.parent,
      memberIds: [...new Set(items.map((item) => item.node.id))],
      columns,
    }];
  });
}

const requirementNodes = (item: LineageChainItem): RoadmapNode[] => {
  const workResult = item.entry.workResult && typeof item.entry.workResult === "object"
    ? item.entry.workResult as { report?: unknown; seed?: unknown }
    : null;
  const report = workResult?.report && typeof workResult.report === "object"
    ? workResult.report as HistoryReport
    : item.node.human_blocker?.reviewPacket?.report ?? null;
  // v0(feat)는 SPEC 요구사항을 보여준다. 이후 patch는 feat 요구사항을 상속하지 않고
  // 해당 patch의 review report가 실제로 검증한 항목만 보여준다.
  const patchSeed = conciseTitle(workResult?.seed ?? item.entry.seed);
  const patchRequirements = Array.isArray(report?.requirements) && report.requirements.length > 0
    ? report.requirements
    : patchSeed
      ? [{ id: `PATCH-${item.version}`, title: patchSeed, status: item.node.status === "done" ? "done" : item.node.status }]
      : [];
  const requirements = item.version === 0 ? item.entry.requirements : patchRequirements;
  if (!Array.isArray(requirements)) return [];
  return requirements
    .filter((value): value is HistoryRequirement => !!value && typeof value === "object")
    .map((req, index) => ({
      id: `${item.key}::${typeof req.id === "string" ? req.id : `REQ-${index + 1}`}`,
      title: typeof req.title === "string" ? req.title : typeof req.id === "string" ? req.id : `REQ-${index + 1}`,
      level: "subtask",
      status: typeof req.status === "string" ? req.status : req.covered === false ? "pending" : "done",
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
export function lineageSelection(item: LineageChainItem) {
  const explicitWorkResult = item.entry.workResult && typeof item.entry.workResult === "object"
    ? item.entry.workResult as Record<string, unknown>
    : null;
  const changedFiles = Array.isArray(item.entry.changedFiles)
    ? item.entry.changedFiles.filter((value): value is string => typeof value === "string")
    : [];
  const sourceRevisionFiles = explicitWorkResult
    && typeof explicitWorkResult.sourceRevision === "object"
    && explicitWorkResult.sourceRevision !== null
    && Array.isArray((explicitWorkResult.sourceRevision as { files?: unknown }).files)
      ? (explicitWorkResult.sourceRevision as { files: Array<{ path?: unknown }> }).files
        .map((file) => file?.path)
        .filter((path): path is string => typeof path === "string")
      : [];
  const storedFiles = explicitWorkResult && Array.isArray(explicitWorkResult.files)
    ? explicitWorkResult.files.filter((file): file is Record<string, unknown> => !!file && typeof file === "object")
    : [];
  const fileEntries = storedFiles.length > 0
    ? storedFiles
      .filter((file): file is Record<string, unknown> & { path: string } => typeof file.path === "string")
      .map((file) => ({ ...file, path: repositoryRelativePath(file.path), artifactTaskId: item.node.id, artifactPatchVersion: item.version }))
    : (changedFiles.length > 0 ? changedFiles : sourceRevisionFiles)
      .map((path) => ({ path: repositoryRelativePath(path), change: "modified" as const, artifactTaskId: item.node.id, artifactPatchVersion: item.version }));
  const hasFallbackResult = typeof item.entry.summary === "string" || fileEntries.length > 0;
  const fallbackWorkResult = hasFallbackResult ? {
    summary: typeof item.entry.summary === "string" ? item.entry.summary : undefined,
    files: fileEntries,
    patchVersion: item.version,
  } : null;
  const presentedWorkResult = explicitWorkResult
    ? { ...explicitWorkResult, ...(fileEntries.length > 0 ? { files: fileEntries } : {}), patchVersion: item.version }
    : fallbackWorkResult;
  const reqs = requirementNodes(item);
  const node: RoadmapNode = {
    ...item.node,
    id: item.key,
    ref: item.node.id,
    approval_read_only: item.node.approval_read_only || item.version < Number((item.node.work_result as { patchVersion?: number } | null)?.patchVersion ?? item.version),
    title: item.title,
    work_result: presentedWorkResult,
    lineage: null,
  };
  // Live children belong to the latest cycle, never to an older history card.
  return { node, reqs, requirementsUnavailable: item.version === 0 && !Array.isArray(item.entry.requirements) };
}
