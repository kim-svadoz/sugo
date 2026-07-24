import { useEffect, useRef, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { getRecentHistory } from "../api/workspacesApi.js";

const POLL_MS = 4000;

export interface ActivityEvent {
  id: number;
  workspace_name: string;
  ts: string;
  level: string;
  agent: string | null;
  handoff_to: string | null;
  event_type: string;
  message: string;
}

interface HistoryFallbackRow {
  id: string;
  workspace_name: string;
  task_title: string | null;
  summary: string | null;
  created_at: string;
}

function historyAsEvents(rows: HistoryFallbackRow[]): ActivityEvent[] {
  return rows.map((r) => ({
    id: 0,
    workspace_name: r.workspace_name,
    ts: r.created_at,
    level: "INFO",
    agent: null,
    handoff_to: null,
    event_type: "COMPLETED",
    message: r.task_title ? `${r.task_title}: ${r.summary ?? ""}` : (r.summary ?? ""),
  }));
}

// §4: "GET /api/activity/stream을 4초 폴링. 비었거나 404면 워크스페이스/recent-history로 폴백."
export function useActivityStream(workspace?: string) {
  const { userId, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId || !isAuthenticated) return;
    let cancelled = false;

    async function poll() {
      if (!userId) return;
      try {
        const res = await apiJson<{ events: ActivityEvent[] }>(
          withUserId("/api/activity/stream", userId, workspace ? { workspace, limit: "50" } : { limit: "50" })
        );
        if (cancelled) return;
        if (res.events && res.events.length > 0) {
          setEvents(res.events);
          return;
        }
        // fallback: recent-history when the stream is empty
        const history = await getRecentHistory(userId, 20);
        if (!cancelled) setEvents(historyAsEvents(history));
      } catch {
        // §4/§7: dashboard being unreachable/erroring must never break polling -
        // just skip this tick and try again next interval.
      }
    }

    void poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [userId, isAuthenticated, workspace]);

  return events;
}
