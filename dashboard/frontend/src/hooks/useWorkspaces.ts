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
    aws_deployments: Array<{
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

// §5: "AuthContext + feature 훅({data,loading,error} 형태)" - no Redux/Zustand.
export function useWorkspaces(): UseWorkspacesResult {
  const { userId } = useAuth();
  const [data, setData] = useState<WorkspaceSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    apiJson<{ workspaces: WorkspaceSummary[] }>(withUserId("/api/workspaces", userId))
      .then((res) => {
        if (!cancelled) {
          setData(res.workspaces);
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
