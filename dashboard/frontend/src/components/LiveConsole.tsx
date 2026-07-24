import { useState } from "react";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { AgentBadge } from "./AgentBadge.js";

const PREVIEW_LINES = 8;

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

// §4: "LiveConsole(전역, 프리뷰 8줄 + 풀콘솔 모달)". 줄 형식:
// "> [MM-DD HH:mm] <badge> workspace › message"
export function LiveConsole() {
  const events = useActivityStream();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, PREVIEW_LINES);

  return (
    <div className="ck-glass ck-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs uppercase opacity-70">Live Console</span>
        <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "축소" : "전체보기"}
        </button>
      </div>
      <div className="ck-scroll space-y-1 font-mono text-xs" style={{ maxHeight: expanded ? "24rem" : undefined }}>
        {visible.length === 0 && <div className="opacity-50">활동 없음</div>}
        {visible.map((ev, i) => (
          <div key={`${ev.id}-${i}`} className="ck-line-in">
            <span className="opacity-50">{`> [${formatTs(ev.ts)}]`}</span>{" "}
            <AgentBadge agent={ev.agent} handoffTo={ev.handoff_to} /> <span className="opacity-70">{ev.workspace_name}</span>{" "}
            <span className="opacity-50">›</span> {ev.message}
          </div>
        ))}
      </div>
    </div>
  );
}
