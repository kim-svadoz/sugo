import { useCallback, useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

const POLL_MS = 4000;

export interface WorkResultFile {
  path: string;
  change: "added" | "modified" | "deleted";
  content?: string;
  diff?: string;
}

export interface WorkResult {
  startedAt?: string;
  endedAt?: string;
  model?: string;
  summary?: string;
  files?: WorkResultFile[];
  parentTaskId?: string;
  patchVersion?: number;
  seed?: string;
  runtimeVerified?: boolean;
  wiringVerified?: boolean;
  prRefs?: unknown;
}

export interface LineageEntry {
  version: number;
  completedAt: string;
  commitType?: string;
  runtimeVerified?: boolean;
  wiringVerified?: boolean;
  title?: string;
  summary?: string;
  changedFiles?: string[];
  seed?: string;
}

export interface CanvasNode {
  id: string;
  title: string;
  level: string;
  status: string;
  depends_on: string | null;
  parent: string | null;
  ref: string | null;
  note: string | null;
  spec_path: string | null;
  work_result: string | null;
  lineage: string | null;
  manual_status: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

// §4: "캔버스 Agent-Canvas 오버레이는 getCanvas을 4초 독립 폴링" - independent
// from LiveConsole's own 4s poll (useActivityStream). Also exposes `refetch`
// so mutations (manual-status, etc.) can refresh immediately instead of
// waiting for the next 4s tick.
export function useCanvas(workspaceName: string) {
  const { userId } = useAuth();
  const [data, setData] = useState<CanvasNode[] | null>(null);
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
        const res = await apiJson<{ nodes: CanvasNode[] }>(
          withUserId(`/api/workspaces/${encodeURIComponent(workspaceName)}/canvas`, userId!)
        );
        if (!cancelled) {
          setData(res.nodes);
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
  }, [userId, workspaceName, refreshNonce]);

  return { data, loading, error, refetch };
}

export function parseWorkResult(raw: string | null): WorkResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkResult;
  } catch {
    return null;
  }
}

export function parseLineage(raw: string | null): LineageEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
