import { Link } from "react-router-dom";
import { useWorkspaces } from "../hooks/useWorkspaces.js";

// §5 Sessions(홈) 골격 — 워크스페이스 카드 + Canvas Progress(roadmapDone/roadmapCount).
// 실제 스펙의 History 검색/체크포인트 모달/LiveConsole 등은 §10 6단계(폴링)/이후 증분에서.
export function Sessions() {
  const { data, loading, error } = useWorkspaces();

  if (loading) return <div className="text-sm opacity-70">불러오는 중...</div>;
  if (error) return <div className="text-sm text-red-400">에러: {error}</div>;
  if (!data || data.length === 0) return <div className="text-sm opacity-70">워크스페이스가 없습니다.</div>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((ws) => {
        const progress = ws.roadmap.total > 0 ? Math.round((ws.roadmap.done / ws.roadmap.total) * 100) : 0;
        const statusPill =
          ws.taskCounts.in_progress > 0 ? "IN PROGRESS" : ws.roadmap.total > 0 && progress === 100 ? "COMPLETED" : "IDLE";
        return (
          <Link key={ws.name} to={`/roadmap/${encodeURIComponent(ws.name)}`} className="ck-glass ck-card block hover:ck-glow-cyan">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm">{ws.name}</span>
              <span className="rounded px-2 py-0.5 text-xs" style={{ color: "var(--color-accent)" }}>
                {statusPill}
              </span>
            </div>
            <div className="mb-2 text-xs opacity-70">
              Canvas Progress: {ws.roadmap.done}/{ws.roadmap.total} ({progress}%)
            </div>
            <div className="flex flex-wrap gap-1">
              {ws.projects.map((p) => (
                <span key={p.project_path} className="rounded bg-white/5 px-2 py-0.5 text-xs">
                  {p.project_path}
                  {p.git_synced ? " ✓" : ""}
                </span>
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
