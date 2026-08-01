import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useAuth } from "../../auth/AuthContext.js";
import { useRoadmap, type RoadmapNode } from "../../hooks/useRoadmap.js";
import { assignRunToSpec, dropSubtree, restoreSubtree } from "../../api/roadmapMutationsApi.js";
import { SubtaskPanel } from "../SubtaskPanel.js";
import { cn } from "../../lib/utils.js";

/** 설계안 치수 상수 — 그대로. */
const NODE_W = 236;
const WS_CARD_W = 560;
const CARD_H = 130;
const LINEAGE_VCARD_H = 72;
const ALERT = "#fb923c";
const C_READY = "#4fa87f";
const C_PROG = "#5c8bcc";
const CONT_HEADER = 54;
const CONT_PAD = 16;
const DROP_ROOM = 44;

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

type NodeData = {
  node: RoadmapNode;
  selected: boolean;
  ready: boolean;
  /** 직속 하위 개수(접혀서 안 보이는 것 포함) — 펼치기 전에 규모를 알아야 한다. */
  childCount?: number;
  /** 하위 중 done 개수. RUN 카드가 `· task N개 (M done)`으로 쓴다. */
  doneChildCount?: number;
  onToggleExpand?: () => void;
};
type FlowNode = Node<NodeData, "roadmap" | "container" | "lineage">;

/**
 * nodeTypes ① — 접힌 **task 카드**와 접힌 **SPEC/RUN 폴더 카드**를 둘 다 그린다(설계안).
 *
 * 접힌 SPEC/RUN은 일반 task 카드가 아니라 **폴더**다: `WS_CARD_W` 폭 + 대시 테두리 + 헤더 밴드
 * + 펼치기 chevron. **클릭하면 펼쳐진다** — 접힌 폴더에서 사람이 기대하는 건 클릭이지
 * 더블클릭이 아니다(더블클릭도 같이 받는다).
 */
function RoadmapNodeCard({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  const st = effStatus(n);
  const isSpec = n.level === "spec";
  const isGroup = isSpec || n.level === "workstream";
  const cs = cardStyle(st, data.ready, isGroup);
  const dim = st === "dropped";

  if (isGroup) {
    const expand = (e: React.MouseEvent) => {
      e.stopPropagation();
      data.onToggleExpand?.();
    };
    return (
      <div className="group/card" style={{ width: WS_CARD_W, opacity: dim ? 0.6 : 1 }}>
        <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
        <div
          className="cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all duration-150 group-hover/card:brightness-110"
          style={{ borderColor: cs.border, background: "rgba(30,41,59,0.35)" }}
          title={isSpec ? "SPEC(마스터 PRD)" : "RUN(실행 묶음)"}
          onClick={expand}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap border-b border-slate-500/25 bg-slate-500/15 py-2.5 pl-2 pr-3">
            <button
              className="nodrag -my-1 flex h-8 w-8 items-center justify-center rounded text-[15px] leading-none text-slate-200 hover:bg-slate-400/20 hover:text-white"
              title="펼치기"
              onClick={expand}
            >
              ▸
            </button>
            <span className={cn("leading-none opacity-80", isSpec ? "text-xl" : "text-base")}>{isSpec ? "📄" : "🔁"}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-md bg-slate-500/25 font-bold leading-none tracking-wider text-slate-200",
                isSpec ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
              )}
            >
              {isSpec ? "SPEC" : "RUN"}
            </span>
            <span className={cn("font-medium text-slate-400/90", isSpec ? "text-[13px]" : "text-[12px]")}>
              {isSpec
                ? `· RUN ${data.childCount ?? 0}개`
                : `· task ${data.childCount ?? 0}개 (${data.doneChildCount ?? 0} done)`}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-slate-200/90",
                isSpec ? "text-[15px] font-semibold" : "text-[13px]",
                dim && "line-through",
              )}
              title={n.title}
            >
              · {n.title}
            </span>
            {n.manual_status && <span className="shrink-0 text-[10px] text-amber-300">✋</span>}
          </div>
        </div>
        <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 9, height: 9, right: -5 }} />
      </div>
    );
  }

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
    // 부모(ReactFlow 노드)가 style.width/height로 실제 크기를 준다 — 자식이 이 안에 놓이므로
    // 여기서 폭을 고정하면 안 된다.
    <div className="h-full w-full" style={{ opacity: dim ? 0.6 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
      <div
        className="h-full w-full rounded-xl border-2 border-dashed transition-all duration-150"
        style={{ borderColor: "#4b5261", background: "rgba(30,41,59,0.35)" }}
        title={isSpec ? "SPEC(마스터 PRD)" : "RUN(실행 묶음)"}
      >
        <div className="flex items-center gap-1.5 whitespace-nowrap border-b border-slate-500/25 bg-slate-500/15 py-2.5 pl-2 pr-3">
          <button
            className="nodrag -my-1 flex h-8 w-8 items-center justify-center rounded text-[15px] leading-none text-slate-200 hover:bg-slate-400/20 hover:text-white"
            title="접기"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleExpand?.();
            }}
          >
            ▾
          </button>
          <span className={cn("leading-none opacity-80", isSpec ? "text-xl" : "text-base")}>{isSpec ? "📄" : "🔁"}</span>
          <span className="rounded-md bg-slate-500/25 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-200">
            {isSpec ? "SPEC" : "RUN"}
          </span>
          <span className="truncate font-mono text-[13px] font-bold text-slate-100" title={n.title}>
            {n.title}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-slate-400">
            {isSpec ? `RUN ${data.childCount ?? 0}개` : `task ${data.childCount ?? 0}개 (${data.doneChildCount ?? 0} done)`}
          </span>
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

/**
 * 그래프에 올릴 노드를 고른다.
 *
 * **subtask(REQ)는 그래프에 올리지 않는다(설계안).** nodeTypes는 roadmap(접힌 task/SPEC·RUN
 * 카드) / container(펼친 SPEC·RUN) / lineage(패치 체인) 셋뿐이고, REQ는 노드가 아니라
 * **오른쪽 SubtaskPanel의 "진행 N/M" 탭**에 들어간다. REQ까지 카드로 뿌리면 task 하나에
 * 카드가 3~5개씩 붙어 위상 그래프가 아니라 목록이 된다.
 *
 * 접힌 컨테이너(SPEC/RUN)의 자손은 숨긴다 — 더블클릭으로 펼쳐야 드러난다.
 */
function visibleNodes(nodes: RoadmapNode[], expanded: Set<string>): RoadmapNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isContainer = (n: RoadmapNode) => n.level === "spec" || n.level === "workstream";

  const hiddenByCollapsedAncestor = (n: RoadmapNode): boolean => {
    let cur = n.parent ? byId.get(n.parent) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (isContainer(cur) && !expanded.has(cur.id)) return true;
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return false;
  };

  return nodes.filter((n) => n.level !== "subtask" && n.level !== "step" && !hiddenByCollapsedAncestor(n));
}

function layout(
  nodes: RoadmapNode[],
  selectedId: string | null,
  expanded: Set<string>,
  onToggleExpand: (id: string) => void,
): { rfNodes: FlowNode[]; rfEdges: Edge[] } {
  const ready = computeReady(nodes);
  // 하위 개수는 **숨긴 것까지 세어** 접힌 카드에 "N 하위"로 보여준다(펼치기 전에 규모를 알아야 한다).
  const childCount = new Map<string, number>();
  const doneChildCount = new Map<string, number>();
  for (const n of nodes) {
    if (!n.parent) continue;
    childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
    if (effStatus(n) === "done") doneChildCount.set(n.parent, (doneChildCount.get(n.parent) ?? 0) + 1);
  }
  nodes = visibleNodes(nodes, expanded);

  // 펼친 SPEC/RUN만 container(대시 테두리 컨테이너). 접혀 있으면 폴더 카드로 그린다.
  const kindOf = (n: RoadmapNode): "roadmap" | "container" | "lineage" => {
    if (n.level === "spec" || n.level === "workstream") return expanded.has(n.id) ? "container" : "roadmap";
    if (n.lineage) return "lineage";
    return "roadmap";
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string, RoadmapNode[]>();
  const roots: RoadmapNode[] = [];
  for (const n of nodes) {
    if (n.parent && byId.has(n.parent)) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
    else roots.push(n);
  }

  /**
   * **2단 레이아웃(설계안).** 펼친 컨테이너는 자식을 *옆에 늘어놓는 게 아니라 품는다* —
   * ReactFlow의 `parentId`로 실제 부모-자식이 되고, 자식 좌표는 부모 기준 상대좌표다.
   *
   * 그래서 안쪽부터 재귀로 크기를 정한다: 자식들을 컨테이너 내부 dagre(nodesep 24·ranksep 80)로
   * 배치해 bbox를 얻고, 그 bbox에 헤더(CONT_HEADER)·여백(CONT_PAD)·드롭 여유(DROP_ROOM)를 더한
   * 값이 컨테이너의 크기가 된다. 이 크기를 가지고 다시 바깥 단계를 배치한다.
   *
   * 안쪽 크기를 모르면 바깥 dagre가 컨테이너를 실제보다 작게 잡아 형제 노드와 겹친다 —
   * 그래서 순서가 뒤집히면 안 된다.
   */
  const size = new Map<string, { w: number; h: number }>();
  const childPos = new Map<string, { x: number; y: number }>();

  const measure = (n: RoadmapNode): { w: number; h: number } => {
    const cached = size.get(n.id);
    if (cached) return cached;
    const kind = kindOf(n);

    if (kind !== "container") {
      const s =
        kind === "lineage"
          ? { w: NODE_W, h: LINEAGE_VCARD_H }
          : n.level === "spec" || n.level === "workstream"
            ? { w: WS_CARD_W, h: CONT_HEADER } // 접힌 폴더 = 헤더 밴드 한 줄
            : { w: NODE_W, h: CARD_H / 2 };
      size.set(n.id, s);
      return s;
    }

    const children = kids.get(n.id) ?? [];
    if (children.length === 0) {
      const s = { w: WS_CARD_W, h: CONT_HEADER + CONT_PAD * 2 };
      size.set(n.id, s);
      return s;
    }

    const inner = new dagre.graphlib.Graph();
    inner.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 80, marginx: 0, marginy: 0 });
    inner.setDefaultEdgeLabel(() => ({}));
    for (const c of children) {
      const cs = measure(c);
      inner.setNode(c.id, { width: cs.w, height: cs.h });
    }
    const childIds = new Set(children.map((c) => c.id));
    for (const c of children) {
      for (const dep of c.depends_on ?? []) if (childIds.has(dep)) inner.setEdge(dep, c.id);
    }
    dagre.layout(inner);

    let maxX = 0;
    let maxY = 0;
    for (const c of children) {
      const p = inner.node(c.id);
      const cs = size.get(c.id)!;
      // dagre는 중심 좌표를 준다 → 좌상단으로 변환하고 컨테이너 안쪽 여백만큼 민다.
      const x = (p?.x ?? 0) - cs.w / 2 + CONT_PAD;
      const y = (p?.y ?? 0) - cs.h / 2 + CONT_HEADER + CONT_PAD;
      childPos.set(c.id, { x, y });
      maxX = Math.max(maxX, x + cs.w);
      maxY = Math.max(maxY, y + cs.h);
    }

    const s = { w: Math.max(WS_CARD_W, maxX + CONT_PAD), h: maxY + CONT_PAD + DROP_ROOM };
    size.set(n.id, s);
    return s;
  };

  for (const r of roots) measure(r);

  // 최상위 산개(설계안) — 컨테이너는 위에서 잰 실제 크기로 자리를 잡는다.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 44, ranksep: 150, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const r of roots) {
    const s = size.get(r.id)!;
    g.setNode(r.id, { width: s.w, height: s.h });
  }
  const rootIds = new Set(roots.map((r) => r.id));
  for (const r of roots) {
    for (const dep of r.depends_on ?? []) if (rootIds.has(dep)) g.setEdge(dep, r.id);
  }
  dagre.layout(g);

  // 엣지는 계층과 무관하게 **보이는 노드 사이 전부** 그린다(컨테이너를 넘나드는 의존도 있다).
  const ids = new Set(nodes.map((n) => n.id));
  const rfEdges: Edge[] = [];
  for (const n of nodes) {
    for (const dep of n.depends_on ?? []) {
      if (!ids.has(dep)) continue;
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

  // ReactFlow는 **부모가 배열에서 자식보다 먼저** 와야 한다 — 위에서 아래로 훑어 담는다.
  const rfNodes: FlowNode[] = [];
  const emit = (n: RoadmapNode, parentId?: string) => {
    const kind = kindOf(n);
    const s = size.get(n.id)!;
    const rootPos = g.node(n.id);
    const position = parentId
      ? (childPos.get(n.id) ?? { x: 0, y: 0 })
      : { x: (rootPos?.x ?? 0) - s.w / 2, y: (rootPos?.y ?? 0) - s.h / 2 };

    rfNodes.push({
      id: n.id,
      type: kind,
      position,
      ...(parentId ? { parentId, extent: "parent" as const } : {}),
      style: { width: s.w, height: s.h },
      data: {
        node: n,
        selected: selectedId === n.id,
        ready: ready.has(n.id),
        childCount: childCount.get(n.id) ?? 0,
        doneChildCount: doneChildCount.get(n.id) ?? 0,
        onToggleExpand: () => onToggleExpand(n.id),
      },
    });

    if (kind === "container") for (const c of kids.get(n.id) ?? []) emit(c, n.id);
  };
  for (const r of roots) emit(r);

  return { rfNodes, rfEdges };
}


interface MenuState {
  x: number;
  y: number;
  node: RoadmapNode;
}

/**
 * 설계안 `RoadmapGraph` — **읽기전용 DAG 뷰어.** 전체화면 페이지(`/roadmap/:workspace`)와
 * Sessions의 Agent Canvas 오버레이 모달이 **같은 컴포넌트를 공유한다**(설계안이 오버레이
 * 본문으로 `<RoadmapGraph fill />`을 그대로 쓴다).
 *
 * 두 자리에 각각 다른 뷰를 두면 "캔버스"라는 말이 화면마다 다른 걸 가리키게 되고, 폐기/편입
 * 같은 조작이 한쪽에만 붙는다.
 *
 * `fill`이면 부모 높이를 채운다(모달·페이지 둘 다 flex 컨테이너 안에 들어간다).
 */
export function RoadmapGraph({
  workspace,
  fill = false,
  onEdited,
}: {
  workspace: string;
  fill?: boolean;
  onEdited?: () => void;
}) {
  const { userId } = useAuth();
  const { data, loading, error, refetch } = useRoadmap(workspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 펼친 SPEC/RUN 집합. **기본은 SPEC만 펼침** — 처음 열었을 때 최상위 구조가 보이되
   *  RUN 안의 task까지 한꺼번에 쏟아지지 않게 한다(더블클릭으로 한 단계씩 내려간다). */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);

  const nodes = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (seeded || nodes.length === 0) return;
    setExpanded(new Set(nodes.filter((n) => n.level === "spec").map((n) => n.id)));
    setSeeded(true);
  }, [nodes, seeded]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { rfNodes, rfEdges } = useMemo(
    () => layout(nodes, selectedId, expanded, toggleExpand),
    [nodes, selectedId, expanded, toggleExpand],
  );

  /** 설계안 droppedTop — dropped인데 부모는 dropped가 아닌 "최상위 폐기"만. */
  const droppedTop = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const isDropped = (n?: RoadmapNode) => !!n && effStatus(n) === "dropped";
    return nodes.filter((n) => isDropped(n) && !isDropped(n.parent ? byId.get(n.parent) : undefined));
  }, [nodes]);

  // 메뉴/폐기함은 여기서 Esc를 잡아 전파를 멈춘다. 안 그러면 메뉴만 닫으려 했는데
  // 바깥 모달의 Esc 핸들러까지 같이 발동해 캔버스 전체가 닫힌다.
  useEffect(() => {
    if (!menu && !binOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (menu) setMenu(null);
      else setBinOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu, binOpen]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
      } finally {
        // 성공이든 실패든 서버 상태를 다시 읽는다 — 낙관적 갱신을 하지 않으므로
        // 화면이 실제와 어긋난 채 남는 경우가 없다.
        refetch();
        onEdited?.();
        setBusy(false);
        setMenu(null);
      }
    },
    [refetch, onEdited],
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const specs = nodes.filter((n) => n.level === "spec");

  if (loading && nodes.length === 0) {
    return (
      <div className={cn("flex items-center justify-center", fill ? "h-full" : "h-64")}>
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn("flex items-center justify-center p-6 text-[13px] text-rose-300", fill && "h-full")}>
        로드맵을 불러오지 못했습니다: {error}
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-0", fill ? "h-full" : "h-[70vh]")}>
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
          // 설계안: fitView는 **maxZoom 1**로 묶는다. 안 묶으면 노드가 적을 때 화면을 채우려
          // 200%까지 확대돼 카드 몇 장이 화면을 다 덮는다(위상이 안 보인다).
          onInit={(inst) => inst.fitView({ padding: 0.18, maxZoom: 1 })}
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          panOnDrag={[0, 1, 2]}
          zoomOnDoubleClick={false}
          onNodeClick={(_, node) => setSelectedId(node.id === selectedId ? null : node.id)}
          onNodeDoubleClick={(_, node) => {
            // 설계안: SPEC/RUN은 더블클릭으로 펼치고 접는다. task는 펼칠 하위(=REQ)가
            // 그래프에 없으므로 아무 일도 하지 않는다(REQ는 오른쪽 패널 소관).
            const n = nodes.find((x) => x.id === node.id);
            if (!n || (n.level !== "spec" && n.level !== "workstream")) return;
            toggleExpand(n.id);
          }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            const n = nodes.find((x) => x.id === node.id);
            // 설계안: 우클릭 메뉴는 RUN/SPEC에서만(task는 잠금 대상).
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
        <div className="ck-scroll w-[340px] shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <SubtaskPanel
            workspace={workspace}
            node={selectedNode}
            reqs={nodes.filter((n) => n.parent === selectedNode.id && n.level === "subtask")}
            onClose={() => setSelectedId(null)}
            onChanged={() => {
              refetch();
              onEdited?.();
            }}
          />
          {/* 설계안 SubtaskPanel — RUN Spec 편입/분리. RUN에서만 뜬다. */}
          {selectedNode.level === "workstream" && (
            <div className="mt-3 rounded-lg border border-[var(--color-border)] p-2.5">
              <div className="mb-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">Spec 편입 / 분리</div>
              <select
                value={selectedNode.parent ?? ""}
                disabled={busy}
                onChange={(e) => run(() => assignRunToSpec(userId!, workspace, selectedNode.id, e.target.value || null))}
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
          <p className="px-3 py-1 text-[10px] text-[var(--color-text-dim)]">삭제가 아니라 되돌릴 수 있는 폐기입니다.</p>
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

/** ReactFlowProvider로 감싼 형태 — 페이지·모달 어디서든 이걸 쓰면 된다. */
export function RoadmapGraphPanel(props: { workspace: string; fill?: boolean; onEdited?: () => void }) {
  return (
    <ReactFlowProvider>
      <RoadmapGraph {...props} />
    </ReactFlowProvider>
  );
}
