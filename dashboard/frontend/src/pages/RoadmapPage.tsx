import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useAuth } from "../auth/AuthContext.js";
import { useRoadmap, type RoadmapNode } from "../hooks/useRoadmap.js";
import { assignRunToSpec, dropSubtree, restoreSubtree } from "../api/roadmapMutationsApi.js";
import { LiveLogTail } from "../components/LiveConsole.js";
import { SubtaskPanel } from "../components/SubtaskPanel.js";
import { cn } from "../lib/utils.js";

/** 설계안 치수 상수 — 그대로. */
const NODE_W = 236;
const WS_CARD_W = 560;
const CARD_H = 130;
const LINEAGE_VCARD_H = 72;
const ALERT = "#fb923c";
const C_READY = "#4fa87f";
const C_PROG = "#5c8bcc";

function effStatus(n: RoadmapNode): string {
  return (n.manual_status ?? n.status ?? "pending").toLowerCase();
}

/** 설계안 statusColor — ready(착수가능)가 in_progress보다 우선한다. */
function statusColor(status: string, ready: boolean): string {
  if (status === "blocked") return ALERT;
  if (ready) return C_READY;
  if (status === "in_progress") return C_PROG;
  return ({ done: "#455c4d", dropped: "#2e323d", pending: "#464b5a" } as Record<string, string>)[status] ?? "#464b5a";
}

/** 설계안 cardStyle — 테두리/액센트/한글 라벨. */
function cardStyle(status: string, ready: boolean, isGroup: boolean) {
  if (isGroup) return { border: "#4b5261", accent: "#4b5261", label: "워크스트림" };
  if (status === "blocked") return { border: ALERT, accent: ALERT, label: "막힘" };
  if (ready) return { border: C_READY, accent: C_READY, label: "착수가능" };
  switch (status) {
    case "in_progress":
      return { border: C_PROG, accent: C_PROG, label: "진행중" };
    case "done":
      return { border: "#3f5a49", accent: "#5f8a6e", label: "완료" };
    case "dropped":
      return { border: "#2a2e38", accent: "#2a2e38", label: "취소" };
    default:
      return { border: "#3a3f4d", accent: "#3a3f4d", label: "대기" };
  }
}

type NodeData = { node: RoadmapNode; selected: boolean; ready: boolean; childCount?: number };
type FlowNode = Node<NodeData, "roadmap" | "container" | "lineage">;

/** nodeTypes ①: 접힌 task/subtask 카드. */
function RoadmapNodeCard({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  const st = effStatus(n);
  const cs = cardStyle(st, data.ready, false);
  const dim = st === "dropped";
  return (
    <div className="group/card" style={{ width: NODE_W, opacity: dim ? 0.55 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
      <div
        className="overflow-hidden rounded-xl border transition-all duration-150"
        style={{
          borderColor: data.selected ? cs.accent : cs.border,
          background: "var(--color-surface)",
          boxShadow: data.selected ? `0 0 0 1px ${cs.accent}, 0 0 18px ${cs.accent}55` : `inset 3px 0 0 ${cs.accent}`,
          padding: "8px 10px",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded border px-1.5 py-0.5 font-mono text-[9.5px]"
            style={{ color: cs.accent, borderColor: `${cs.accent}66` }}
          >
            {n.level}
          </span>
          <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase" style={{ color: cs.accent }}>
            {st === "in_progress" && (
              <span className="h-1.5 w-1.5 rounded-full ck-pulse-dot" style={{ background: cs.accent }} />
            )}
            {cs.label}
          </span>
        </div>
        <div className={cn("mt-1 truncate font-mono text-[12.5px] text-slate-100", dim && "line-through")} title={n.title}>
          {n.title}
        </div>
        {n.manual_status && <span className="mt-1 inline-block text-[9.5px] text-amber-300">✋ 수동</span>}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 9, height: 9, right: -5 }} />
    </div>
  );
}

/** nodeTypes ②: 펼친 SPEC/RUN 컨테이너 — 대시 테두리 + 헤더 밴드. */
function WorkstreamContainer({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  const isSpec = n.level === "spec";
  const st = effStatus(n);
  const dim = st === "dropped";
  return (
    <div style={{ width: WS_CARD_W, opacity: dim ? 0.6 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
      <div
        className="overflow-hidden rounded-xl border-2 border-dashed transition-all duration-150"
        style={{ borderColor: "#4b5261", background: "rgba(30,41,59,0.35)" }}
        title={isSpec ? "SPEC(마스터 PRD)" : "RUN(실행 묶음)"}
      >
        <div className="flex items-center gap-2 border-b border-slate-500/25 bg-slate-500/15 py-2.5 pl-3 pr-3 whitespace-nowrap">
          <span className="rounded border border-slate-400/40 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300">
            {isSpec ? "SPEC" : "RUN"}
          </span>
          <span className="truncate font-mono text-[13px] font-bold text-slate-100" title={n.title}>
            {n.title}
          </span>
          <span className="ml-auto font-mono text-[10.5px] text-slate-400">{data.childCount ?? 0} 하위</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 9, height: 9, right: -5 }} />
    </div>
  );
}

/** nodeTypes ③: patch 계보 체인(보라 계열 — §5.4 secondary). */
function LineageChainNode({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  return (
    <div style={{ width: NODE_W, height: LINEAGE_VCARD_H }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="h-full overflow-hidden rounded-xl border border-violet-500/50 bg-violet-500/10 px-2.5 py-2">
        <div className="font-mono text-[9.5px] text-violet-300">patch 계보</div>
        <div className="mt-1 truncate font-mono text-[12px] text-violet-100" title={n.title}>
          {n.title}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { roadmap: RoadmapNodeCard, container: WorkstreamContainer, lineage: LineageChainNode };

/** to가 전부 done이어야 from이 착수가능. 미지의 의존은 not-done으로 본다(안전측). */
function computeReady(nodes: RoadmapNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ready = new Set<string>();
  for (const n of nodes) {
    const st = effStatus(n);
    if (st !== "pending") continue;
    const deps = n.depends_on ?? [];
    if (deps.every((d) => effStatus(byId.get(d) ?? ({ status: "pending" } as RoadmapNode)) === "done")) ready.add(n.id);
  }
  return ready;
}

function layout(nodes: RoadmapNode[], selectedId: string | null): { rfNodes: FlowNode[]; rfEdges: Edge[] } {
  const ready = computeReady(nodes);
  const childCount = new Map<string, number>();
  for (const n of nodes) if (n.parent) childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);

  const g = new dagre.graphlib.Graph();
  // 설계안 "최상위 산개" 값.
  g.setGraph({ rankdir: "LR", nodesep: 44, ranksep: 150, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));

  const kindOf = (n: RoadmapNode): "roadmap" | "container" | "lineage" => {
    if (n.level === "spec" || n.level === "workstream") return "container";
    if (n.lineage) return "lineage";
    return "roadmap";
  };

  for (const n of nodes) {
    const kind = kindOf(n);
    g.setNode(n.id, {
      width: kind === "container" ? WS_CARD_W : NODE_W,
      height: kind === "lineage" ? LINEAGE_VCARD_H : kind === "container" ? 60 : CARD_H / 2,
    });
  }

  const ids = new Set(nodes.map((n) => n.id));
  const rfEdges: Edge[] = [];
  for (const n of nodes) {
    for (const dep of n.depends_on ?? []) {
      if (!ids.has(dep)) continue;
      g.setEdge(dep, n.id);
      rfEdges.push({
        id: `${dep}->${n.id}`,
        source: dep,
        target: n.id,
        type: "default",
        animated: effStatus(n) === "in_progress",
        style: { stroke: "rgba(148,163,184,0.45)" },
      });
    }
  }
  dagre.layout(g);

  const rfNodes: FlowNode[] = nodes.map((n) => {
    const pos = g.node(n.id);
    const kind = kindOf(n);
    return {
      id: n.id,
      type: kind,
      position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
      data: { node: n, selected: selectedId === n.id, ready: ready.has(n.id), childCount: childCount.get(n.id) ?? 0 },
    };
  });
  return { rfNodes, rfEdges };
}

interface MenuState {
  x: number;
  y: number;
  node: RoadmapNode;
}

function RoadmapInner() {
  const { workspace = "" } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { data, loading, error, refetch } = useRoadmap(workspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const nodes = useMemo(() => data ?? [], [data]);
  const { rfNodes, rfEdges } = useMemo(() => layout(nodes, selectedId), [nodes, selectedId]);

  /** 설계안 droppedTop — dropped인데 부모는 dropped가 아닌 "최상위 폐기" 노드만. */
  const droppedTop = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const isDropped = (n?: RoadmapNode) => !!n && effStatus(n) === "dropped";
    return nodes.filter((n) => isDropped(n) && !isDropped(n.parent ? byId.get(n.parent) : undefined));
  }, [nodes]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { done: 0, in_progress: 0, pending: 0, blocked: 0, dropped: 0 };
    for (const n of nodes) {
      const st = effStatus(n);
      if (st in c) c[st]++;
    }
    return c;
  }, [nodes]);

  // Esc로 닫기 — 메뉴 → 폐기함 → 페이지 순서.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else if (binOpen) setBinOpen(false);
      else navigate("/sessions");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, binOpen, navigate]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        refetch();
      } catch {
        // 실패는 조용히 무시하지 않고 목록을 다시 읽어 현재 상태를 보여준다.
        refetch();
      } finally {
        setBusy(false);
        setMenu(null);
      }
    },
    [refetch],
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const specs = nodes.filter((n) => n.level === "spec");

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }
  if (error) return <div className="p-6 text-[13px] text-rose-300">로드맵을 불러오지 못했습니다: {error}</div>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-background)]">
      {/* 상단바 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
        <button
          onClick={() => navigate("/sessions")}
          className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 font-mono text-[12px] text-[var(--color-text-muted)] transition-colors hover:text-cyan-300"
        >
          ← 워크스페이스
        </button>
        <span className="font-mono text-[13px] font-bold text-[var(--color-text-bright)]">
          {workspace} · Agent Canvas
        </span>
        <span className="font-mono text-[11px] text-[var(--color-text-dim)]">Esc / ← 로 닫기</span>
        <div className="ml-auto flex items-center gap-2 font-mono text-[11px]">
          <span className="text-emerald-400">완료 {counts.done}</span>
          <span className="text-[#5c8bcc]">진행 {counts.in_progress}</span>
          <span className="text-slate-400">대기 {counts.pending}</span>
          {counts.blocked > 0 && <span className="text-amber-400">막힘 {counts.blocked}</span>}
          {counts.dropped > 0 && <span className="text-[var(--color-text-dim)]">❌ {counts.dropped}</span>}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {droppedTop.length > 0 && (
            <button
              onClick={() => setBinOpen(true)}
              className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-rose-400/50 hover:text-rose-300"
              title="폐기함 — 버린 항목 보기/복구"
            >
              🗑️ 폐기함 {droppedTop.length}
            </button>
          )}
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            panOnDrag={[0, 1, 2]}
            onNodeClick={(_, node) => setSelectedId(node.id === selectedId ? null : node.id)}
            onNodeContextMenu={(e, node) => {
              e.preventDefault();
              const n = nodes.find((x) => x.id === node.id);
              // 설계안: 우클릭 메뉴는 **RUN/SPEC에서만** 뜬다(task는 잠금 대상).
              if (!n || (n.level !== "workstream" && n.level !== "spec")) return;
              setMenu({ x: e.clientX, y: e.clientY, node: n });
            }}
            onPaneClick={() => setMenu(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#1e293b" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(nd) => {
                const n = nodes.find((x) => x.id === nd.id);
                return n ? statusColor(effStatus(n), false) : "#464b5a";
              }}
              style={{ background: "var(--color-surface)" }}
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div className="w-[340px] shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3 ck-scroll">
            <SubtaskPanel workspace={workspace} node={selectedNode} onClose={() => setSelectedId(null)} onChanged={refetch} />
            {/* 설계안 SubtaskPanel — RUN Spec 편입/분리 섹션. RUN에서만 뜬다. */}
            {selectedNode.level === "workstream" && (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] p-2.5">
                <div className="mb-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">Spec 편입 / 분리</div>
                <select
                  value={selectedNode.parent ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    run(() => assignRunToSpec(userId!, workspace, selectedNode.id, e.target.value || null))
                  }
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)]"
                >
                  <option value="">— 미분류(분리) —</option>
                  {specs.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.title}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10.5px] text-[var(--color-text-dim)]">
                  task와 달리 RUN은 다른 Spec으로 다시 옮길 수 있습니다.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 워크스페이스 로그 tail */}
      {/* 하단 로그 스트립 — 높이를 고정한다. 마운트 후 높이가 바뀌면 ReactFlow의 fitView가
          이미 계산을 끝낸 뒤라 그래프가 잘린 채로 남는다. */}
      <div className="h-28 shrink-0 overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <LiveLogTail workspace={workspace} />
      </div>

      {/* 우클릭 컨텍스트 메뉴 — RUN/SPEC 전용 */}
      {menu && (
        <div
          className="ck-pop fixed z-[95] min-w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          <div className="truncate border-b border-[var(--color-border)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--color-text-dim)]">
            {menu.node.level === "spec" ? "SPEC" : "RUN"} · {menu.node.title}
          </div>
          {effStatus(menu.node) === "dropped" ? (
            <button
              disabled={busy}
              onClick={() => run(() => restoreSubtree(userId!, workspace, menu.node.id))}
              className="block w-full px-3 py-1.5 text-left text-[12.5px] text-emerald-300 hover:bg-[var(--color-surface-hover)]"
            >
              복구
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => run(() => dropSubtree(userId!, workspace, menu.node.id))}
              className="block w-full px-3 py-1.5 text-left text-[12.5px] text-rose-300 hover:bg-[var(--color-surface-hover)]"
            >
              폐기 (하위 포함)
            </button>
          )}
          <p className="px-3 py-1 text-[10px] text-[var(--color-text-dim)]">
            삭제가 아니라 되돌릴 수 있는 폐기입니다.
          </p>
        </div>
      )}

      {/* 폐기함 모달 */}
      {binOpen && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4" onMouseDown={() => setBinOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-xl border border-[var(--color-border)] ck-glass p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-[var(--color-text)]">
              🗑️ 폐기함 <span className="text-[12px] text-[var(--color-text-muted)]">({droppedTop.length})</span>
            </div>
            <div className="ck-scroll max-h-80 space-y-1 overflow-auto pr-1">
              {droppedTop.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5"
                >
                  <span className="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--color-text-dim)]">
                    {n.level}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-text-muted)] line-through">
                    {n.title}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => run(() => restoreSubtree(userId!, workspace, n.id))}
                    className="shrink-0 rounded border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                  >
                    복구
                  </button>
                </div>
              ))}
              {droppedTop.length === 0 && (
                <div className="py-8 text-center text-[12.5px] text-[var(--color-text-dim)]">폐기된 항목이 없습니다</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RoadmapPage() {
  return (
    <ReactFlowProvider>
      <RoadmapInner />
    </ReactFlowProvider>
  );
}
