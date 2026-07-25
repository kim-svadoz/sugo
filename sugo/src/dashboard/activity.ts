import { resolveDashboardConfig } from "./config.js";
import { pushEvent } from "./client.js";

export type ActivityAgent = "MAIN" | "CODE" | "TEST" | "REVIEW" | "DOCS";
export type ActivityEventType = "EXECUTE" | "HANDOFF" | "COMPLETED" | "SYSTEM";

export interface ActivityEventInput {
  workspaceName: string;
  agent: ActivityAgent;
  handoffTo?: string;
  eventType: ActivityEventType;
  level?: string;
  message: string;
  details?: unknown;
}

const ACTIVITY_TIMEOUT_MS = 3000;

/**
 * §7.2 Activity Stream: `POST /api/activity/ingest`. 완전 논블로킹(3s) — 실패는
 * pushEvent가 재시도 큐로 흡수하므로 이 함수도 절대 던지지 않는다. 태스크 완료·에이전트
 * 핸드오프 시점에 호출한다(§7.2 "완료 이벤트·핸드오프에 emit").
 */
export async function emitActivity(event: ActivityEventInput): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent(
    "/api/activity/ingest",
    "POST",
    { userId: config.userId, ts: new Date().toISOString(), ...event },
    ACTIVITY_TIMEOUT_MS,
  );
}
