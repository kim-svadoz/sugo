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
  // Backend normalizes JSON columns to a driver-independent shape (see
  // dashboard/backend/src/db/jsonColumn.ts) - always real parsed values here,
  // never a JSON-encoded string, regardless of DB_DRIVER.
  depends_on: string[];
  parent: string | null;
  ref: string | null;
  note: string | null;
  spec_path: string | null;
  work_result: unknown;
  lineage: unknown;
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

// Lenient by design: the backend always sends already-parsed JSON now, but
// these accept a raw string too (defensive - mirrors the backend's own
// parseMaybeJson helper, see dashboard/backend/src/db/jsonColumn.ts).
export function parseWorkResult(value: unknown): WorkResult | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as WorkResult;
    } catch {
      return null;
    }
  }
  return value as WorkResult;
}

export function parseLineage(value: unknown): LineageEntry[] {
  if (value === null || value === undefined) return [];
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  return Array.isArray(parsed) ? (parsed as LineageEntry[]) : [];
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
