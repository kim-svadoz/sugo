import { useCallback, useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import type { HumanBlocker } from "../api/roadmapMutationsApi.js";
import type { RuntimeAssessment } from "../lib/taskGuidance.js";
import { useAuth } from "../auth/AuthContext.js";

const POLL_MS = 4000;

export interface WorkResultFile {
  path: string;
  change: "added" | "modified" | "deleted";
  content?: string;
  diff?: string;
}

export interface WorkResult {
  approvalResultKey?: string;
  path?: string;
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
  report?: WorkResultReport;
}

export interface CompletionLabel {
  kind: string; reason: string; patchVersion: number; recordedAt: string; implementationCycle?: number; supersededAt?: string; supersededByCycle?: number;
}
export interface HumanApprovalEvent {
  labelId: string; action: "approve" | "revoke"; userId: string; at: string; kind: string; originalReason: string; reason: string; workResultPath: string;
}
export interface WorkResultReport {
  bypassLabels?: CompletionLabel[];
  humanApprovals?: HumanApprovalEvent[];
  schemaVersion: 1;
  featureName?: string;
  kind: "feat" | "patch";
  patchVersion: number;
  completedAt?: string;
  completionGrade: "verified" | "unverified" | "verified_by_human";
  summary: string;
  changedFiles: string[];
  requirements?: { id: string; covered: boolean }[];
  designDecisions: string[];
  knownLimitations: string[];
  seed?: string;
  verification: {
    test: { command?: string; total?: number; passed?: number; failed?: number; state: "pass" | "fail" | "unverified" };
    runtimeVerified: boolean;
    wiringVerified?: boolean;
    validationVerdict?: "pass" | "partial" | "fail";
    autoVerifiedCount?: number;
    contradictionCount?: number;
  };
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

export interface RoadmapNode {
  deployment?: import("../lib/specDeployment.js").SpecDeployment;
  display_status?: string;
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
  runtime_assessment?: RuntimeAssessment | null;
  lineage: unknown;
  manual_status: string | null;
  /** 수동 완료 처리한 사람 — 카드 뱃지 title에 쓴다(AI 완료가 아님을 밝힌다). */
  manual_by?: string | null;
  pos_x: number | null;
  pos_y: number | null;
  /** 마지막 변경 시각(UTC). "⏳ 확인 필요/정체 의심" stale 판정에 쓴다. */
  updated_at?: string | null;
  synced_at?: string | null;
  blocker_decision?: { response: string; answered_by: string; answered_at: string } | null;
  human_blocker?: HumanBlocker | null;
}

/** 설계안 RoadmapTab이 받는 봉투. counts/issues는 **서버가** 센다(전체 기준 진척). */
export interface RoadmapCounts {
  verification?: number;
  total: number;
  pending: number;
  in_progress: number;
  done: number;
  blocked: number;
  dropped: number;
}
export interface RoadmapEnvelope {
  nodes: RoadmapNode[];
  counts: RoadmapCounts;
  issues: string[];
}
const EMPTY_COUNTS: RoadmapCounts = { total: 0, pending: 0, in_progress: 0, done: 0, blocked: 0, dropped: 0 };

// §4: "캔버스 Agent-Roadmap 오버레이는 getRoadmap을 4초 독립 폴링" - independent
// from LiveConsole's own 4s poll (useActivityStream). Also exposes `refetch`
// so mutations (manual-status, etc.) can refresh immediately instead of
// waiting for the next 4s tick.
export function useRoadmap(workspaceName: string) {
  const { userId } = useAuth();
  const [data, setData] = useState<RoadmapNode[] | null>(null);
  const [counts, setCounts] = useState<RoadmapCounts>(EMPTY_COUNTS);
  const [issues, setIssues] = useState<string[]>([]);
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
        const res = await apiJson<Partial<RoadmapEnvelope> & { nodes: RoadmapNode[] }>(
          withUserId(`/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap`, userId!)
        );
        if (!cancelled) {
          setData(res.nodes);
          // 구버전 백엔드는 counts/issues를 안 준다 — 그때는 조용히 빈 값으로 둔다(화면이 죽는 것보다 낫다).
          setCounts(res.counts ?? EMPTY_COUNTS);
          setIssues(res.issues ?? []);
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

  return { data, counts, issues, loading, error, refetch };
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
