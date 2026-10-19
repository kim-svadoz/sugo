import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { getSchedule, type ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { getScheduleMemos, type ScheduledMemo } from "../api/scheduleMemoApi.js";
import { getScheduleCommitments, type ScheduleCommitment } from "../api/scheduleCommitmentApi.js";
import { getScheduleSpecArchives, type ScheduleSpecArchive } from "../api/scheduleSpecArchiveApi.js";

const POLL_MS = 4000;

interface ScheduleSnapshot {
  data: ScheduledSpec[];
  memos: ScheduledMemo[];
  commitments: ScheduleCommitment[] | null;
  archives: ScheduleSpecArchive[];
}

const scheduleCache = new Map<string, ScheduleSnapshot>();
const scheduleRequests = new Map<string, Promise<ScheduleSnapshot>>();

function fetchScheduleSnapshot(userId: string): Promise<ScheduleSnapshot> {
  const pending = scheduleRequests.get(userId);
  if (pending) return pending;
  const request = Promise.all([
    getSchedule(userId),
    getScheduleMemos(userId),
    getScheduleCommitments(userId).catch(() => null),
    getScheduleSpecArchives(userId),
  ]).then(([data, memos, commitments, archives]) => {
    const snapshot = { data, memos, commitments, archives };
    scheduleCache.set(userId, snapshot);
    return snapshot;
  }).finally(() => scheduleRequests.delete(userId));
  scheduleRequests.set(userId, request);
  return request;
}

/** Schedule 탭 — `useRoadmap`과 같은 4초 폴링 관례. 워크스페이스 하나가 아니라
 * 로그인 사용자 전체를 가로질러 조회하므로 workspaceName 인자가 없다. */
export function useSchedule() {
  const { userId } = useAuth();
  const initial = userId ? scheduleCache.get(userId) : undefined;
  const [data, setData] = useState<ScheduledSpec[] | null>(() => initial?.data ?? null);
  const [memos, setMemos] = useState<ScheduledMemo[] | null>(() => initial?.memos ?? null);
  const [commitments, setCommitments] = useState<ScheduleCommitment[] | null>(() => initial?.commitments ?? null);
  const [archives, setArchives] = useState<ScheduleSpecArchive[]>(() => initial?.archives ?? []);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refetch = useCallback(() => setRefreshNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const cached = scheduleCache.get(userId);
    if (cached) {
      setData(cached.data);
      setMemos(cached.memos);
      setCommitments(cached.commitments);
      setArchives(cached.archives);
    }
    setLoading(!cached);

    async function fetchOnce(isFirst: boolean) {
      try {
        const snapshot = await fetchScheduleSnapshot(userId!);
        if (!cancelled) {
          setData(snapshot.data);
          setMemos(snapshot.memos);
          setCommitments(snapshot.commitments);
          setArchives(snapshot.archives);
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

  return { data, memos, commitments, archives, loading, error, refetch };
}
