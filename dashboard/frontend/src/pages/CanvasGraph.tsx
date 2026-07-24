import { useState } from "react";
import { useParams } from "react-router-dom";
import { useCanvas } from "../hooks/useCanvas.js";
import { SubtaskPanel } from "../components/SubtaskPanel.js";

// §5 CanvasGraph 골격 — 이번 증분은 의도적으로 간소화: 실제 스펙의 @xyflow/react+dagre
// DAG 캔버스 시각화는 별도 증분에서 다룬다(브라우저로 실제 확인할 수 있게 되면 리팩토링).
// 노드는 계층 리스트로만 보여주되, 선택하면 SubtaskPanel이 열림(진행상황/summary/파일/
// lineage/수동조작/PR 패널 — §5).
export function CanvasGraph() {
  const { workspace = "" } = useParams();
  const { data, loading, error, refetch } = useCanvas(workspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading) return <div className="text-sm opacity-70">불러오는 중...</div>;
  if (error) return <div className="text-sm text-red-400">에러: {error}</div>;
  if (!data) return null;

  const selected = data.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <h1 className="mb-4 font-mono text-lg" style={{ color: "var(--color-primary)" }}>
          {workspace}
        </h1>
        <ul className="space-y-2">
          {data.map((node) => {
            const effectiveStatus = node.manual_status ?? node.status;
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`ck-glass ck-card flex w-full items-center justify-between text-left text-sm hover:ck-glow-cyan ${
                    selectedId === node.id ? "ck-glow-cyan" : ""
                  }`}
                >
                  <div>
                    <span className="mr-2 rounded bg-white/5 px-2 py-0.5 text-xs uppercase">{node.level}</span>
                    <span>{node.title}</span>
                    {node.manual_status && (
                      <span className="ml-2 rounded px-2 py-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
                        ✋ 수동
                      </span>
                    )}
                  </div>
                  <span className="text-xs opacity-70">{effectiveStatus}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {selected && (
        <SubtaskPanel workspace={workspace} node={selected} onClose={() => setSelectedId(null)} onChanged={refetch} />
      )}
    </div>
  );
}
