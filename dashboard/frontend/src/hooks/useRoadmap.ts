import { useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

const POLL_MS = 4000;

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

// §4: "로드맵 Agent-Canvas 오버레이는 getRoadmap을 4초 독립 폴링" - independent
// from LiveConsole's own 4s poll (useActivityStream).
export function useRoadmap(workspaceName: string) {
  const { userId } = useAuth();
  const [data, setData] = useState<RoadmapNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchOnce(isFirst: boolean) {
      if (isFirst) setLoading(true);
      try {
        const res = await apiJson<{ nodes: RoadmapNode[] }>(
          withUserId(`/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap`, userId!)
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
  }, [userId, workspaceName]);

  return { data, loading, error };
}
