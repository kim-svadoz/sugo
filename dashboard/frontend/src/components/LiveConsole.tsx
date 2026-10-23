import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ListTree, Maximize2, Minimize2 } from "lucide-react";
import { useActivityStream, type ActivityEvent } from "../hooks/useActivityStream.js";
import { AgentBadge } from "./AgentBadge.js";
import { formatActivityTime } from "../lib/activityTime.js";
import { summarizeActivity } from "../lib/activityPresentation.js";
import { eventTask, groupByTask } from "../lib/workFloor.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { resolveTaskTitle } from "../lib/taskTitle.js";

/**
 * 실시간 Activity Stream(폴링, SSE 아님).
 *
 * **고정폭 5컬럼:** Col1 프롬프트 `>`(w-3) / Col2 타임스탬프(w-[92px]) /
 * **Col3 뱃지 고정폭 w-[96px]** / Col4 워크스페이스 / Col5 메시지(truncate).
 * 뱃지 칸을 "TEST → REVIEW" 최대폭으로 못박아야 워크스페이스·메시지 시작점이 세로로 정렬된다 —
 * 안 그러면 핸드오프가 있는 줄만 오른쪽으로 밀려 로그가 계단처럼 보인다.
 *
 * **전량 렌더 + overflow 스크롤.** 앞의 N줄만 잘라 두면 버스트가 올 때 옛 로그가 밀려나고
 * 공백이 남는다. 이벤트가 0건이면 **history 폴백 없이** "이벤트 대기 중"을 그린다 — 없는 걸
 * 다른 데이터로 메우면 실시간이라고 오해한다.
 */
function FeedLine({ ev, expanded = false }: { ev: ActivityEvent; expanded?: boolean }) {
  return (
    <div className="ck-line-in flex items-start gap-1.5 font-mono text-[11.5px] leading-relaxed">
      <span className="w-3 shrink-0 text-[var(--color-text-dim)]">&gt;</span>
      <span className="w-[116px] shrink-0 whitespace-nowrap font-semibold text-slate-300" title="한국 표준시 (KST)">[{formatActivityTime(ev.ts)}]</span>
      <span className="w-[112px] shrink-0 overflow-hidden whitespace-nowrap">
        <AgentBadge agent={ev.agent} handoffTo={ev.handoff_to} />
      </span>
      <span className="w-28 shrink-0 truncate text-[var(--color-text-muted)]" title={ev.workspace_name}>{ev.workspace_name}</span>
      <span
        className={`log-message-body min-w-0 flex-1 ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}
      >
        {ev.message}
      </span>
    </div>
  );
}

/** 전역 콘솔. `workspace`를 주면 그 워크스페이스 로그만 거른다(Sessions 하단 2단이 그렇게 쓴다). */
export function LiveConsole({ workspace, taskKey }: { workspace?: string; taskKey?: string | null } = {}) {
  const events = useActivityStream(workspace);
  const { data: specs } = useSchedule();
  const [full, setFull] = useState(false);
  const byWorkspace = workspace ? events.filter((e) => e.workspace_name === workspace) : events;
  const visible = taskKey ? groupByTask(byWorkspace).get(taskKey)?.events.slice().reverse() ?? [] : byWorkspace;
  const summary = summarizeActivity(visible);
  const task = visible[0] ? eventTask(visible[0]) : null;
  const title = task ? resolveTaskTitle({ workspace: visible[0].workspace_name, taskId: task.taskId, projectPath: task.projectPath, name: task.name, at: Date.parse(visible[0].ts) }, specs ?? []) : null;

  useEffect(() => {
    if (!full) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [full]);

  const renderFeed = (expanded = false) => (
    <div className="ck-scroll min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
      {visible.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-[var(--color-text-dim)]">이벤트 대기 중</div>
      ) : (
        visible.map((ev, i) => <FeedLine key={`${ev.id}-${i}`} ev={ev} expanded={expanded} />)
      )}
    </div>
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between border-b border-[var(--color-border)] pb-2.5">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-text-bright)]"><ListTree size={14} className="shrink-0 text-cyan-300" />최근 작업 요약</span>
          <button
            type="button"
            onClick={() => setFull(true)}
            className="text-[11px] font-medium text-cyan-300 transition-colors hover:text-cyan-100"
          >
            전체 기록
          </button>
        </div>
        {visible.length === 0 ? <div className="flex min-h-40 items-center justify-center text-[12px] text-[var(--color-text-dim)]">새 작업 신호가 없습니다.</div> : <div className="space-y-3">
          {title && <div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="truncate text-[11px] text-slate-200">{title.title}</strong>{title.kind && <span className="rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-200">{title.kind}</span>}{title.project && <span className="inline-flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-slate-400"><span aria-hidden="true">📦</span>{title.project}</span>}</div>}
          <ul className="space-y-2 border-l border-emerald-300/20 pl-3">{(summary.result.length > 0 ? summary.result : [visible[0].message]).slice(0, 4).map((line, index) => <li key={`${index}:${line}`} className="flex gap-2 text-[11px] leading-5 text-slate-300"><span className="text-emerald-300/60">•</span><span className="line-clamp-2">{line}</span></li>)}</ul>
        </div>}
      </div>

      {full && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={() => setFull(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative flex h-[80vh] w-full max-w-7xl flex-col rounded-xl border border-cyan-500/40 ck-glass ck-glow-cyan p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span className="text-[13px] font-semibold text-[var(--color-text-bright)]">전체 작업 기록</span>
              <button
                onClick={() => setFull(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                닫기
              </button>
            </div>
            {renderFeed(true)}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** 워크스페이스별 tail — Agent Canvas 오버레이 하단에 붙는다. slice(0,40). */
export function LiveLogTail({ workspace }: { workspace: string }) {
  const events = useActivityStream(workspace);
  const [expanded, setExpanded] = useState(false);
  const visible = events.filter((e) => e.workspace_name === workspace).slice(0, 40);
  return (
    <div className={`flex min-h-0 flex-col ${expanded ? "h-[40vh] min-h-28" : "h-28"}`}>
      <div className="flex shrink-0 justify-end pb-1">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? "콘솔 축소" : "콘솔 확대"}
          aria-expanded={expanded}
          title={expanded ? "콘솔 축소" : "콘솔 확대"}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] transition-colors hover:border-cyan-400/50 hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      <div className="ck-scroll min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
        {visible.length === 0 ? (
          <div className="py-4 text-center text-[11.5px] text-[var(--color-text-dim)]">이벤트 대기 중</div>
        ) : (
          visible.map((ev, i) => <FeedLine key={`${ev.id}-${i}`} ev={ev} expanded={expanded} />)
        )}
      </div>
    </div>
  );
}
