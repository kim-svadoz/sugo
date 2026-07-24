import { useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

export interface RoadmapNode {
  id: string;
  title: string;
  level: string;
  status: string;
  depends_on: string | null;
  parent: string | null;
  manual_status: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

export function useRoadmap(workspaceName: string) {
  const { userId } = useAuth();
  const [data, setData] = useState<RoadmapNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    apiJson<{ nodes: RoadmapNode[] }>(withUserId(`/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap`, userId))
      .then((res) => {
        if (!cancelled) {
          setData(res.nodes);
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
  }, [userId, workspaceName]);

  return { data, loading, error };
}
