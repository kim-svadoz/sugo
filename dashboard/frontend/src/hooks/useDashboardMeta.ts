import { useEffect, useState } from "react";
import { apiJson, withUserId } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

/**
 * §5.5 버전 2축.
 *
 * - **Console(대시보드) 버전은 빌드타임 상수**(`__DASHBOARD_VERSION__`)다. API로 받아오면
 *   백엔드가 죽었을 때 "지금 내가 무슨 버전을 보고 있는지"조차 알 수 없는데, 그건 장애 상황에서
 *   가장 먼저 필요한 정보다.
 * - **Plugin 버전은 런타임 조회**(`GET /api/sync/plugin-version`). 마지막 sync에서 받은 값이라
 *   본질적으로 서버에만 있다. 아직 sync된 적이 없으면 `null` — 지어내지 않는다("모른다"가 정확).
 */
export function useDashboardMeta(): { dashboardVersion: string; pluginVersion: string | null } {
  const { userId } = useAuth();
  const [pluginVersion, setPluginVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    apiJson<{ version: string | null }>(withUserId("/api/sync/plugin-version", userId))
      .then((d) => {
        if (alive) setPluginVersion(d?.version ?? null);
      })
      .catch(() => {
        // 조회 실패는 "모른다"로 남긴다 — 헤더가 `—`를 그린다.
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return { dashboardVersion: __DASHBOARD_VERSION__, pluginVersion };
}
