import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RoadmapGraphPanel } from "../components/roadmap/RoadmapGraph.js";
import { LiveLogTail } from "../components/LiveConsole.js";
import { useRoadmap } from "../hooks/useRoadmap.js";

/**
 * §5.1 `/roadmap/:workspace` — `fixed inset-0 z-50` 전체 팝업(사이드바까지 덮는다).
 *
 * 그래프 본체는 `RoadmapGraph`가 갖고 있고 여기는 **껍데기만** 담당한다 — Sessions의
 * Agent Canvas 오버레이도 같은 컴포넌트를 쓰므로 두 자리가 갈라지지 않는다.
 */
export function RoadmapPage() {
  const { workspace = "" } = useParams();
  const navigate = useNavigate();
  const { data } = useRoadmap(workspace);
  const nodes = data ?? [];

  const counts: Record<string, number> = { done: 0, in_progress: 0, pending: 0, blocked: 0, dropped: 0 };
  for (const n of nodes) {
    const st = (n.manual_status ?? n.status ?? "pending").toLowerCase();
    if (st in counts) counts[st]++;
  }

  // Esc / ← 로 닫는다. 그래프 안의 메뉴·폐기함이 Esc를 먼저 잡아 전파를 멈추므로
  // "메뉴만 닫으려다 페이지까지 닫히는" 일은 없다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "ArrowLeft") navigate("/sessions");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-background)]">
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

      <div className="min-h-0 flex-1">
        <RoadmapGraphPanel workspace={workspace} fill />
      </div>

      <div className="h-28 shrink-0 overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <LiveLogTail workspace={workspace} />
      </div>
    </div>
  );
}
