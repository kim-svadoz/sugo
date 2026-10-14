import { useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

/** 백엔드 `listWorkspaces`가 설계안 카드/Inspector가 읽는 모양 그대로 내려준다. */
export interface WorkspaceSummary {
  name: string;
  projects: Array<{
    project_path: string;
    git_synced: number;
    aws_synced: number;
    aws_release: {
      pipeline: string;
      baseBranch: string;
      buildProject: string | null;
      latestBuildNumber: number | null;
      latestBuildCommit: string | null;
      latestBuildStatus: string | null;
      latestBuildAt: string | null;
    } | null;
    local_git: { branch: string | null; headCommit: string | null; dirty: boolean };
    aws_deployments: Array<{
      linkMode: "suggested" | "confirmed";
      accountName: string;
      environment: string;
      region: string;
      cluster: string | null;
      service: string;
      status: string | null;
      rolloutState: string | null;
      healthState: "HEALTHY" | "DEPLOYING" | "DEGRADED" | "INACTIVE" | "UNKNOWN";
      matchSource: "image" | "service";
      taskDefinition: string | null;
      revision: number | null;
      runningCount: number | null;
      desiredCount: number | null;
      images: string[];
      deployedAt: string | null;
      taskDefinitionRegisteredAt: string | null;
      observedAt: string | null;
      pinpointApplicationName: string | null;
      apmState: "OBSERVED" | "STALE" | "MISSING" | "UNKNOWN" | null;
      apmRunningAgents: number | null;
      apmAgentCount: number | null;
      apmLatestHeartbeatAt: string | null;
      apmSampleCount: number | null;
      apmErrorCount: number | null;
      apmErrorRate: number | null;
      apmAverageResponseMs: number | null;
      apmP95ResponseMs: number | null;
      apmMaxResponseMs: number | null;
      apmApdexScore: number | null;
      apmSignal: "TRAFFIC_OK" | "ERRORS_OBSERVED" | "NO_TRAFFIC" | "UNAVAILABLE" | null;
    }>;
  }>;
  taskCounts: { pending: number; in_progress: number; done: number; archived: number };
  roadmap: { total: number; done: number; active: number };
  roadmapCount: number;
  roadmapDoneCount: number;
  activeTaskCount: number;
  historyCount: number;
  decisionCount: number;
  checkpointCount: number;
  projectCount: number;
  attentionCount: number;
  attentionLabel: string | null;
  lastActivityAt: string | null;
}

interface UseWorkspacesResult {
  data: WorkspaceSummary[] | null;
  loading: boolean;
  error: string | null;
}

const workspaceCache = new Map<string, WorkspaceSummary[]>();
const workspaceRequests = new Map<string, Promise<WorkspaceSummary[]>>();

function fetchWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const pending = workspaceRequests.get(userId);
  if (pending) return pending;
  const request = apiJson<{ workspaces: WorkspaceSummary[] }>(withUserId("/api/workspaces", userId))
    .then((res) => {
      workspaceCache.set(userId, res.workspaces);
      return res.workspaces;
    })
    .finally(() => workspaceRequests.delete(userId));
  workspaceRequests.set(userId, request);
  return request;
}

// §5: "AuthContext + feature 훅({data,loading,error} 형태)" - no Redux/Zustand.
export function useWorkspaces(): UseWorkspacesResult {
  const { userId } = useAuth();
  const [data, setData] = useState<WorkspaceSummary[] | null>(() => userId ? workspaceCache.get(userId) ?? null : null);
  const [loading, setLoading] = useState(() => userId ? !workspaceCache.has(userId) : true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const cached = workspaceCache.get(userId);
    if (cached) setData(cached);
    setLoading(!cached);
    fetchWorkspaces(userId)
      .then((workspaces) => {
        if (!cancelled) {
          setData(workspaces);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { data, loading, error };
}
