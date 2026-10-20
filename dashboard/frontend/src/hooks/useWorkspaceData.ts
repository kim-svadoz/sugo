import { useCallback, useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

/**
 * Sessions 화면이 쓰는 워크스페이스 상세 훅들. 전부 `{data, loading, refresh}` 같은 모양이라
 * 제네릭 하나로 만든다 — 네 벌을 복붙하면 하나만 고치고 나머지를 잊는다.
 *
 * `workspace`가 null이면 조회하지 않는다(카드를 아직 안 골랐을 때 헛된 요청 방지).
 */
function useWorkspaceResource<T>(workspace: string | null, path: string, pick: (raw: never) => T[]) {
  const { userId } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!workspace || !userId) {
      setData([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiJson<never>(withUserId(`/api/workspaces/${encodeURIComponent(workspace)}/${path}`, userId))
      .then((raw) => {
        if (!cancelled) setData(pick(raw));
      })
      .catch(() => {
        // 실패는 빈 목록으로 degrade — 화면 전체를 죽이지 않는다.
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // pick은 호출부에서 인라인으로 넘어와 매 렌더 새 참조라 의존성에서 뺀다(경로/대상만 바뀌면 재조회).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, userId, path, nonce]);

  return { data, loading, refresh };
}

export interface HistoryLog {
  id: string;
  task_id: string | null;
  task_title: string | null;
  spec_title: string | null;
  summary: string | null;
  key_decisions?: string[] | null;
  files_changed?: string[] | null;
  completed_at: string | null;
  created_at: string;
}

export interface Checkpoint {
  id: string;
  category: string;
  title: string;
  learned_from: string | null;
  checklist: string[] | null;
  applies_to: string[] | null;
  checkpoint_date: string | null;
  expires_at: string | null;
  created_at: string;
}

export function useWorkspaceHistory(workspace: string | null) {
  return useWorkspaceResource<HistoryLog>(workspace, "history", (raw: never) => (raw as { history: HistoryLog[] }).history ?? []);
}

export function useWorkspaceCheckpoints(workspace: string | null) {
  return useWorkspaceResource<Checkpoint>(workspace, "checkpoints", (raw: never) => (raw as { checkpoints: Checkpoint[] }).checkpoints ?? []);
}

/** `formatDate` — 없으면 대시(빈 문자열이면 레이아웃이 흔들린다). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}
