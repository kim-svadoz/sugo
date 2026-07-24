import { useParams } from "react-router-dom";
import { useRoadmap } from "../hooks/useRoadmap.js";

// §5 RoadmapGraph 골격 — 이번 증분은 의도적으로 간소화: 실제 스펙의 @xyflow/react+dagre
// DAG 캔버스/SubtaskPanel/lineage 시각화는 별도 증분(§10 5단계 나머지)에서 다룬다.
// 여기서는 노드 목록 + 상태/소유권 필드(manual_status/pos_x,y)만 확인 가능한 계층 리스트.
export function RoadmapGraph() {
  const { workspace = "" } = useParams();
  const { data, loading, error } = useRoadmap(workspace);

  if (loading) return <div className="text-sm opacity-70">불러오는 중...</div>;
  if (error) return <div className="text-sm text-red-400">에러: {error}</div>;
  if (!data) return null;

  return (
    <div>
      <h1 className="mb-4 font-mono text-lg" style={{ color: "var(--color-primary)" }}>
        {workspace}
      </h1>
      <ul className="space-y-2">
        {data.map((node) => {
          const effectiveStatus = node.manual_status ?? node.status;
          return (
            <li key={node.id} className="ck-glass ck-card flex items-center justify-between text-sm">
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
