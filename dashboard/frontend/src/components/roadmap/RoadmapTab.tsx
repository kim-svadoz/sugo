import { workflowStatus } from "../../lib/workflowStatus.js";
import { useMemo, useState } from "react";
import { RoadmapGraphPanel } from "./RoadmapGraph.js";
import { useRoadmap, type RoadmapNode } from "../../hooks/useRoadmap.js";
import { cn } from "../../lib/utils.js";

/**
 * 설계안 `filterActiveNodes` — "진행 중심" 보기.
 *
 * 규칙: **미완료** + **미완료와 dependsOn으로 맞닿은 완료** + **그릇(spec/workstream)** +
 * 살아남은 노드의 **조상·자손**.
 *
 * 맞닿은 완료까지 남기는 게 핵심이다. 완료를 전부 지우면 "지금 할 수 있는 일"의 근거
 * (앞 작업이 끝났다는 사실)가 화면에서 사라져, 착수가능 초록이 이유 없이 떠 있는 것처럼 보인다.
 */
export function filterActiveNodes(all: RoadmapNode[]): RoadmapNode[] {
  const eff = workflowStatus;
  const byId = new Map(all.map((n) => [n.id, n]));
  const keep = new Set<string>();

  for (const n of all) {
    const st = eff(n);
    // 그릇은 항상 남긴다 — 그릇이 사라지면 안의 카드가 부모를 잃고 최상위로 튄다.
    if (n.level === "spec" || n.level === "workstream") keep.add(n.id);
    if (st !== "done" && st !== "dropped") keep.add(n.id);
  }

  // 미완료와 의존으로 맞닿은 완료(양방향)를 끌어온다.
  for (const n of all) {
    if (!keep.has(n.id)) continue;
    for (const dep of n.depends_on ?? []) if (byId.has(dep)) keep.add(dep);
  }
  for (const n of all) {
    for (const dep of n.depends_on ?? []) if (keep.has(dep) && keep.has(n.id)) keep.add(n.id);
  }

  // 조상 보존(부모 없는 카드가 생기지 않게) + 자손 보존(펼쳤을 때 빈 상자가 되지 않게).
  const withAncestors = new Set(keep);
  for (const id of keep) {
    let cur = byId.get(id)?.parent ?? null;
    while (cur && !withAncestors.has(cur)) {
      withAncestors.add(cur);
      cur = byId.get(cur)?.parent ?? null;
    }
  }
  const kids = new Map<string, RoadmapNode[]>();
  for (const n of all) if (n.parent) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  const out = new Set(withAncestors);
  const stack = [...withAncestors];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of kids.get(id) ?? []) {
      if (out.has(c.id)) continue;
      // 자손은 subtask(REQ)까지 끌고 온다 — 오른쪽 패널이 그걸로 진행률을 그린다.
      out.add(c.id);
      stack.push(c.id);
    }
  }
  return all.filter((n) => out.has(n.id));
}

/**
 * 설계안 RoadmapTab — 진행 요약 바 + 이상징후 경고 + 그래프.
 *
 * counts는 **서버가** 센다. 여기서 세면 "진행 중심"으로 노드를 걸러낸 순간 진척률이 같이
 * 흔들린다 — 필터는 보기이지 진척이 아니다.
 */
export function RoadmapTab({
  workspace,
  onEdited,
  fill,
  focusNodeId,
  onFileViewerChange,
}: {
  workspace: string;
  onEdited?: () => void;
  fill?: boolean;
  /** §7B Schedule 탭 딥링크(`/roadmap/:workspace?focus=`). */
  focusNodeId?: string;
  onFileViewerChange?: (open: boolean) => void;
}) {
  const { data, counts, issues, loading } = useRoadmap(workspace);
  const [showDone, setShowDone] = useState(false); // 기본: 진행 중심
  const nodes = useMemo(() => data ?? [], [data]);
  const visible = useMemo(() => (showDone ? nodes : filterActiveNodes(nodes)), [nodes, showDone]);
  const hiddenCount = nodes.length - visible.length;

  if (loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }
  if (nodes.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">
        로드맵 노드 없음 — 플러그인에서 sugo_roadmap(action: add)로 등록하세요
      </div>
    );
  }

  return (
    <div className={fill ? "flex h-full flex-col gap-3" : "space-y-4"}>
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <span className="text-sm text-[var(--color-text)]">
          진행 <span className="font-semibold text-green-400">{counts.done}</span>/{counts.total}
        </span>
        <span className="text-xs text-blue-400">🔄 {counts.in_progress}</span>
        <span className="text-xs text-amber-300">검증 {counts.verification ?? 0}</span>
        <span className="text-xs text-[var(--color-text-muted)]">⏸️ {counts.pending}</span>
        {counts.blocked > 0 && <span className="text-xs text-red-400">⛔ {counts.blocked}</span>}
        {counts.dropped > 0 && <span className="text-xs text-[var(--color-text-muted)]">❌ {counts.dropped}</span>}
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--color-border)]">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${counts.total ? Math.round((counts.done / counts.total) * 100) : 0}%` }}
          />
        </div>
        {!showDone && hiddenCount > 0 && (
          <span className="font-mono text-[11px] text-[var(--color-text-dim)]">{hiddenCount}개 숨김</span>
        )}
        <button
          onClick={() => setShowDone((v) => !v)}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors",
            showDone
              ? "border-[var(--color-border)] text-[var(--color-text-muted)]"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
          )}
          title="전체 노드 / 진행 중심(미완료 + 맞닿은 완료, 그릇 포함)"
        >
          {showDone ? "◉ 전체" : "◯ 진행 중심"}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="shrink-0 space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          {issues.map((i) => (
            <p key={i} className="flex items-center gap-1.5 text-xs text-red-400">
              ⚠️ {i}
            </p>
          ))}
        </div>
      )}

      {fill ? (
        <div className="min-h-0 flex-1">
          <RoadmapGraphPanel workspace={workspace} onEdited={onEdited} nodeFilter={visible} focusNodeId={focusNodeId} onFileViewerChange={onFileViewerChange} fill />
        </div>
      ) : (
        <RoadmapGraphPanel workspace={workspace} onEdited={onEdited} nodeFilter={visible} focusNodeId={focusNodeId} onFileViewerChange={onFileViewerChange} />
      )}
    </div>
  );
}
