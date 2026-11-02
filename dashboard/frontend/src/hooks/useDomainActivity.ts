import { useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import type { ActivityEvent } from "./useActivityStream.js";

const POLL_MS = 8000;

/**
 * 도메인 목록용 활동 기록. 전체 스트림의 최근 50건만 보면 조용한 도메인의 확인 대기가 밀려 사라지므로
 * 도메인마다 따로 가져온다. 목록 표시는 실시간일 필요가 없어 작업장(4초)보다 느리게 돈다.
 */
export function useDomainActivity(names: readonly string[]): ReadonlyMap<string, ActivityEvent[]> {
  const { userId, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<ReadonlyMap<string, ActivityEvent[]>>(new Map());
  const key = names.join("\n");

  useEffect(() => {
    if (!userId || !isAuthenticated || key === "") return;
    let cancelled = false;
    const list = key.split("\n");
    const poll = async () => {
      const rows = await Promise.all(list.map((name) =>
        apiJson<{ events: ActivityEvent[] }>(withUserId("/api/activity/stream", userId, { workspace: name, limit: "50" }))
          .then((res) => [name, res.events ?? []] as const)
          // 한 도메인 조회가 실패하면 그 도메인은 직전 값을 유지한다. 확인 대기 표시가 깜빡이지 않게 한다.
          .catch(() => [name, null] as const)));
      if (!cancelled) setEvents((previous) => new Map(rows.map(([name, list]) => [name, list ?? previous.get(name) ?? []])));
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [userId, isAuthenticated, key]);

  return events;
}
