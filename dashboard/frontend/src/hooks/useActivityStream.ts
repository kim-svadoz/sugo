import { useEffect, useRef, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

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

/**
 * §6 Activity Stream 4초 폴링(SSE 아님).
 *
 * **history 폴백을 두지 않는다.** 스트림이 비었을 때 recent-history를 이벤트처럼 변환해 채우면
 * 사용자가 "지금 에이전트가 돌고 있다"고 오해한다 — 실시간 로그가 없다는 건 그 자체로 정보다.
 * 비면 비어 있는 채로 두고 화면이 "이벤트 대기 중"을 그린다.
 */
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
        setEvents(res.events ?? []);
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
