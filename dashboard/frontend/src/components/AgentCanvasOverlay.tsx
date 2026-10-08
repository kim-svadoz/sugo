import { useEffect } from "react";
import { ChevronRight, GitBranch, X } from "lucide-react";
import { useRoadmap } from "../hooks/useRoadmap.js";
import { RoadmapTab } from "./roadmap/RoadmapTab.js";
import { LiveLogTail } from "./LiveConsole.js";

/**
 * 설계안 로드맵(Agent Canvas) 전체화면 오버레이 — `z-[70]`.
 *
 * Sessions.tsx에 있던 걸 §7B SchedulePage와 공유하려고 분리했다(동작 변경 없음).
 * **본문은 `<RoadmapGraph fill />`이다(리스트가 아니다).** 전체화면 페이지와 같은 그래프를
 * 그대로 띄우는 게 스펙이고, 그래야 "캔버스"가 화면마다 다른 걸 가리키지 않는다.
 *
 * 화면을 거의 다 쓴다(`m-3 flex-1`) — 위상 그래프를 좁은 모달에 넣으면 노드가 겹쳐서
 * 팬/줌을 해야만 읽히고, 그러면 "훑어보는" 용도 자체가 성립하지 않는다.
 */
export function AgentCanvasOverlay({
  workspace,
  onClose,
  focusNodeId,
  initialInspectorTab,
}: {
  workspace: string;
  onClose: () => void;
  /** §7B Schedule 탭에서 특정 spec을 보려고 열었을 때. */
  focusNodeId?: string;
  initialInspectorTab?: "progress" | "summary";
}) {
  const { data, refetch } = useRoadmap(workspace);
  const nodes = data ?? [];
  const specNode = nodes.find((n) => n.level === "spec");
  const specLabel = specNode?.spec_path ? specNode.spec_path.split(/[\\/]/).filter(Boolean).pop() : specNode?.title;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/60 backdrop-blur-sm"
      style={{ animation: "agentCanvasModalFade 0.2s ease" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative m-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]"
        style={{
          animation: "agentCanvasModalUp 0.3s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
              <span className="font-mono text-cyan-300/80">SYSTEM</span>
              <ChevronRight size={12} />
              <span className="font-semibold text-[var(--color-text)]">{workspace}</span>
              {specLabel && (
                <>
                  <ChevronRight size={12} />
                  <span className="truncate font-mono">AGENT CANVAS: {specLabel}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-cyan-300" />
              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10.5px] text-cyan-300">
                4-Tier · Spec ⊃ Run ⊃ Task ⊃ REQ
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className="hidden items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] sm:inline-flex"
              title="4초 폴링으로 실시간 반영"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ck-pulse-dot" /> Polling 4s
            </span>
            <span className="hidden text-[13px] text-[var(--color-text-muted)] sm:inline">Esc로 닫기</span>
            <button
              onClick={onClose}
              className="group flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] transition-all hover:border-rose-400 hover:bg-rose-500/15 hover:text-white"
              title="닫기 (Esc)"
            >
              <X size={20} className="transition-transform group-hover:rotate-90" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
              Agent Canvas 데이터가 없습니다
            </div>
          ) : (
            <RoadmapTab workspace={workspace} focusNodeId={focusNodeId} initialInspectorTab={initialInspectorTab} fill onEdited={refetch} />
          )}
        </div>

        <div className="shrink-0 px-3 pb-3 pt-1">
          <LiveLogTail workspace={workspace} />
        </div>
      </div>
      <style>{`
        @keyframes agentCanvasModalFade{from{opacity:0}to{opacity:1}}
        @keyframes agentCanvasModalUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
    </div>
  );
}
