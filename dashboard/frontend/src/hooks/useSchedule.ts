import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { getSchedule, type ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { getArchivedScheduleMemos, getScheduleMemos, type ScheduledMemo } from "../api/scheduleMemoApi.js";
import { getScheduleCommitments, type ScheduleCommitment } from "../api/scheduleCommitmentApi.js";
import { getScheduleSpecArchives, type ArchivePagination, type ScheduleSpecArchive } from "../api/scheduleSpecArchiveApi.js";

const POLL_MS = 4000;

interface ScheduleSnapshot {
  data: ScheduledSpec[];
  memos: ScheduledMemo[];
  commitments: ScheduleCommitment[] | null;
  archives: ScheduleSpecArchive[];
  memoArchives: ScheduledMemo[];
  archivePagination: ArchivePagination;
  memoArchivePagination: ArchivePagination;
}

const scheduleCache = new Map<string, ScheduleSnapshot>();
const scheduleRequests = new Map<string, Promise<ScheduleSnapshot>>();

function fetchScheduleSnapshot(userId: string, archivePage: number, memoArchivePage: number): Promise<ScheduleSnapshot> {
  const requestKey = `${userId}:${archivePage}:${memoArchivePage}`;
  const pending = scheduleRequests.get(requestKey);
  if (pending) return pending;
  const request = Promise.all([
    getSchedule(userId),
    getScheduleMemos(userId),
    getScheduleCommitments(userId).catch(() => null),
    getScheduleSpecArchives(userId, archivePage),
    getArchivedScheduleMemos(userId, memoArchivePage),
  ]).then(([data, memos, commitments, archiveResult, memoArchiveResult]) => {
    const snapshot = { data, memos, commitments, archives: archiveResult.items, memoArchives: memoArchiveResult.items, archivePagination: archiveResult.pagination, memoArchivePagination: memoArchiveResult.pagination };
    scheduleCache.set(userId, snapshot);
    return snapshot;
  }).finally(() => scheduleRequests.delete(requestKey));
  scheduleRequests.set(requestKey, request);
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
  const [memoArchives, setMemoArchives] = useState<ScheduledMemo[]>(() => initial?.memoArchives ?? []);
  const emptyPagination = { total: 0, page: 1, pageSize: 20, hasMore: false };
  const [archivePagination, setArchivePagination] = useState<ArchivePagination>(() => initial?.archivePagination ?? emptyPagination);
  const [memoArchivePagination, setMemoArchivePagination] = useState<ArchivePagination>(() => initial?.memoArchivePagination ?? emptyPagination);
  const [archivePage, setArchivePage] = useState(1);
  const [memoArchivePage, setMemoArchivePage] = useState(1);
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
      setMemoArchives(cached.memoArchives);
      setArchivePagination(cached.archivePagination);
      setMemoArchivePagination(cached.memoArchivePagination);
    }
    setLoading(!cached);

    async function fetchOnce(isFirst: boolean) {
      try {
        const snapshot = await fetchScheduleSnapshot(userId!, archivePage, memoArchivePage);
        if (!cancelled) {
          setData(snapshot.data);
          setMemos(snapshot.memos);
          setCommitments(snapshot.commitments);
          setArchives(snapshot.archives);
          setMemoArchives(snapshot.memoArchives);
          setArchivePagination(snapshot.archivePagination);
          setMemoArchivePagination(snapshot.memoArchivePagination);
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
  }, [userId, refreshNonce, archivePage, memoArchivePage]);

  return { data, memos, commitments, archives, memoArchives, archivePagination, memoArchivePagination, setArchivePage, setMemoArchivePage, loading, error, refetch };
}
