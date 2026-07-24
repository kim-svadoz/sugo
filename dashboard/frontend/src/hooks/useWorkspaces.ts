import { useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

export interface WorkspaceSummary {
  name: string;
  projects: { project_path: string; git_synced: number }[];
  taskCounts: { pending: number; in_progress: number; done: number; archived: number };
  roadmap: { total: number; done: number; active: number };
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
