import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useActivityStream, type ActivityEvent } from "../hooks/useActivityStream.js";
import { AgentBadge } from "./AgentBadge.js";

// §2/§5: "프론트는 Asia/Seoul 렌더" - formatted as MM-DD HH:mm regardless of
// what timezone the ts string arrived in.
function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return ts;
  }
}

/**
 * §6 실시간 Activity Stream(폴링, SSE 아님).
 *
 * **고정폭 5컬럼(v2 신규):** Col1 프롬프트 `>`(w-3) / Col2 타임스탬프(w-[92px]) /
 * **Col3 뱃지 고정폭 w-[96px]** / Col4 도메인 / Col5 메시지(truncate).
 * 뱃지 칸을 "TEST → REVIEW" 최대폭으로 못박아야 도메인·메시지 시작점이 세로로 정렬된다 —
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
      <span className="w-[92px] shrink-0 text-[var(--color-text-dim)]">[{formatTs(ev.ts)}]</span>
      <span className="w-[96px] shrink-0 overflow-hidden whitespace-nowrap">
        <AgentBadge agent={ev.agent} handoffTo={ev.handoff_to} />
      </span>
      <span className="shrink-0 text-[var(--color-text-muted)]">{ev.workspace_name}</span>
      <span
        className={`log-message-body min-w-0 flex-1 ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}
      >
        {ev.message}
      </span>
    </div>
  );
}

/** 전역 콘솔. `workspace`를 주면 그 도메인 로그만 거른다(Sessions 하단 2단이 그렇게 쓴다). */
export function LiveConsole({ workspace }: { workspace?: string } = {}) {
  const events = useActivityStream(workspace);
  const [full, setFull] = useState(false);
  const visible = workspace ? events.filter((e) => e.workspace_name === workspace) : events;

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
        <div className="mb-2 flex shrink-0 items-center justify-between border-b border-[var(--color-border)] pb-2">
          <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold text-[var(--color-text-bright)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ck-pulse-dot" /> LIVE CONSOLE
            {workspace && <span className="text-[11px] font-normal text-[var(--color-text-dim)]">· {workspace}</span>}
          </span>
          <button
            type="button"
            onClick={() => setFull(true)}
            className="font-mono text-[11px] text-[var(--color-text-muted)] transition-colors hover:text-cyan-300"
          >
            VIEW FULL CONSOLE
          </button>
        </div>
        {renderFeed()}
      </div>

      {full && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={() => setFull(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative flex h-[80vh] w-full max-w-5xl flex-col rounded-xl border border-cyan-500/40 ck-glass ck-glow-cyan p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span className="font-mono text-[13px] font-semibold text-[var(--color-text-bright)]">FULL CONSOLE</span>
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

/** §6 워크스페이스별 tail — Agent Canvas 오버레이 하단에 붙는다. slice(0,40). */
export function LiveLogTail({ workspace }: { workspace: string }) {
  const events = useActivityStream(workspace);
  const visible = events.filter((e) => e.workspace_name === workspace).slice(0, 40);
  return (
    <div className="ck-scroll h-24 space-y-0.5 overflow-auto pr-1">
      {visible.length === 0 ? (
        <div className="py-4 text-center text-[11.5px] text-[var(--color-text-dim)]">이벤트 대기 중</div>
      ) : (
        visible.map((ev, i) => <FeedLine key={`${ev.id}-${i}`} ev={ev} />)
      )}
    </div>
  );
}
