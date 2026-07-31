import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useRoadmap, type RoadmapNode } from "../hooks/useRoadmap.js";
import { SubtaskPanel } from "../components/SubtaskPanel.js";

// §5 RoadmapGraph — @xyflow/react + dagre(LR), 읽기전용 뷰어. 노드는 living-state 색,
// depends_on 엣지, ✋수동 칩, 우측 SubtaskPanel. (Spec/RUN 컨테이너 그룹핑은 후속 증분)
const NODE_W = 214;
const NODE_H = 76;

type TaskNodeData = { node: RoadmapNode; selected: boolean };
type FlowNode = Node<TaskNodeData, "task">;

function effStatus(n: RoadmapNode): string {
  return (n.manual_status ?? n.status ?? "pending").toLowerCase();
}
function statusColor(status: string): string {
  if (status === "done" || status === "completed") return "#34d399";
  if (status === "in_progress" || status === "running") return "#00b4d8";
  if (status === "archived" || status === "dropped") return "#64748b";
  if (status === "pending" || status === "idea") return "#94a3b8";
  return "#f59e0b";
}

function TaskNodeCard({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  const st = effStatus(n);
  const color = statusColor(st);
  const manual = !!n.manual_status;
  return (
    <div
      className="ck-glass"
      style={{
        width: NODE_W,
        borderRadius: 12,
        borderColor: data.selected ? color : "rgba(148,163,184,0.2)",
        boxShadow: data.selected ? `0 0 0 1px ${color}, 0 0 18px ${color}66` : `inset 3px 0 0 ${color}`,
        padding: "8px 10px",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color, width: 7, height: 7, border: "none" }} />
      <div className="flex items-center justify-between">
        <span className="ck-pill" style={{ color, borderColor: color + "55", fontSize: "0.58rem", padding: "0 6px" }}>{n.level}</span>
        <span className="flex items-center gap-1 font-mono text-[0.56rem] uppercase" style={{ color }}>
          {st === "in_progress" && <span className="h-1.5 w-1.5 rounded-full ck-pulse-dot" style={{ background: color }} />}
          {st}
        </span>
      </div>
      <div className="mt-1 truncate font-mono text-[0.78rem] text-slate-100" title={n.title}>{n.title}</div>
      {manual && <span className="mt-1 inline-block text-[0.56rem] text-amber-300">✋ 수동</span>}
      <Handle type="source" position={Position.Right} style={{ background: color, width: 7, height: 7, border: "none" }} />
    </div>
  );
}

const nodeTypes = { task: TaskNodeCard };

function layout(nodes: RoadmapNode[], selectedId: string | null): { rfNodes: FlowNode[]; rfEdges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 26, ranksep: 76, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  const rfEdges: Edge[] = [];
  for (const n of nodes) {
    for (const dep of n.depends_on ?? []) {
      if (!ids.has(dep)) continue;
      g.setEdge(dep, n.id);
      rfEdges.push({
        id: `${dep}->${n.id}`,
        source: dep,
        target: n.id,
        style: { stroke: "rgba(0,180,216,0.45)", strokeWidth: 1.5 },
        markerEnd: { type: "arrowclosed" as never, color: "rgba(0,180,216,0.6)" },
      });
    }
  }
  dagre.layout(g);
  const rfNodes: FlowNode[] = nodes.map((n) => {
    const p = g.node(n.id);
    return {
      id: n.id,
      type: "task",
      position: { x: (p?.x ?? 0) - NODE_W / 2, y: (p?.y ?? 0) - NODE_H / 2 },
      data: { node: n, selected: n.id === selectedId },
      draggable: false,
    };
  });
  return { rfNodes, rfEdges };
}

export function RoadmapPage() {
  const { workspace = "" } = useParams();
  const { data, loading, error, refetch } = useRoadmap(workspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { rfNodes, rfEdges } = useMemo(() => layout(data ?? [], selectedId), [data, selectedId]);
  const selected = data?.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="font-mono text-lg font-bold ck-text-glow" style={{ color: "var(--color-primary)" }}>{workspace}</h1>
        <span className="ck-pill text-slate-400">{data?.length ?? 0} nodes</span>
        {loading && <span className="text-xs text-slate-500">동기화 중…</span>}
        {error && <span className="text-xs text-red-400">에러: {error}</span>}
      </div>

      <div className="flex gap-3">
        <div className="ck-glass relative flex-1 overflow-hidden rounded-xl" style={{ height: "calc(100vh - 190px)" }}>
          {(!data || data.length === 0) && !loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              이 워크스페이스에 캔버스 노드가 없습니다 — 플러그인에서 <code className="mx-1" style={{ color: "var(--color-primary)" }}>/sugo:feat</code> 를 돌리면 노드가 채워집니다.
            </div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
              maxZoom={1.6}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(148,163,184,0.18)" />
              <MiniMap pannable zoomable maskColor="rgba(4,7,17,0.7)" nodeColor={(nd) => statusColor(effStatus((nd.data as TaskNodeData).node))} style={{ background: "rgba(11,18,32,0.9)", border: "1px solid rgba(148,163,184,0.2)" }} />
              <Controls showInteractive={false} style={{ background: "rgba(11,18,32,0.9)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8 }} />
            </ReactFlow>
          )}
        </div>

        {selected && (
          <SubtaskPanel workspace={workspace} node={selected} onClose={() => setSelectedId(null)} onChanged={refetch} />
        )}
      </div>
    </div>
  );
}
