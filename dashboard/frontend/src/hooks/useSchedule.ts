import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { getSchedule, type ScheduledSpec } from "../api/roadmapMutationsApi.js";

const POLL_MS = 4000;

/** §7B Schedule 탭 — `useRoadmap`과 같은 4초 폴링 관례. 워크스페이스 하나가 아니라
 * 로그인 사용자 전체를 가로질러 조회하므로 workspaceName 인자가 없다. */
export function useSchedule() {
  const { userId } = useAuth();
  const [data, setData] = useState<ScheduledSpec[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refetch = useCallback(() => setRefreshNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchOnce(isFirst: boolean) {
      if (isFirst) setLoading(true);
      try {
        const specs = await getSchedule(userId!);
        if (!cancelled) {
          setData(specs);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled && isFirst) setLoading(false);
      }
    }

    void fetchOnce(true);
    const timer = setInterval(() => void fetchOnce(false), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, refreshNonce]);

  return { data, loading, error, refetch };
}
