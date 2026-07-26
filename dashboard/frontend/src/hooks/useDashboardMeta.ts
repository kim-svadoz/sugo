import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

// 헤더/사이드바 버전 뱃지용. /health(공개)에서 대시보드 버전을 읽는다.
export function useDashboardMeta() {
  const [meta, setMeta] = useState<{ dashboardVersion: string | null; pluginVersion: string | null }>({
    dashboardVersion: null,
    pluginVersion: null,
  });

  useEffect(() => {
    let alive = true;
    apiFetch("/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setMeta((m) => ({ ...m, dashboardVersion: d.version ?? null }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return meta;
}
