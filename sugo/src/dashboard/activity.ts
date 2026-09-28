import { resolveDashboardConfig } from "./config.js";
import { pushEvent } from "./client.js";

export type ActivityAgent = "MAIN" | "CODE" | "TEST" | "REVIEW" | "DOCS";
export type ActivityEventType = "EXECUTE" | "HANDOFF" | "COMPLETED" | "SYSTEM";

export interface ActivityEventInput {
  workspaceName: string;
  agent: ActivityAgent;
  handoffTo?: ActivityAgent;
  eventType: ActivityEventType;
  level?: string;
  message: string;
  details?: unknown;
}

type HandoffActivity = Omit<ActivityEventInput, "workspaceName">;

/**
 * 상태머신의 성공 전이를 Live Console handoff의 정본으로 바꾼다.
 * sugo_chain은 프롬프트 전달 보조 수단이라 호출이 생략될 수 있으므로 관측 로그의 근거로 쓰지 않는다.
 */
export function activityForPlanTransition(action: string, fromState: string, featureName: string): HandoffActivity | null {
  if (action === "code_start") {
    const agent: ActivityAgent = fromState === "REVIEW_RUNNING" ? "REVIEW" : fromState === "TEST_DONE" ? "TEST" : "MAIN";
    return {
      agent,
      handoffTo: "CODE",
      eventType: "HANDOFF",
      message: agent === "MAIN" ? `${featureName} 구현 시작` : `${featureName} 구현 재진입`,
    };
  }
  if (action === "test_start") {
    return { agent: "CODE", handoffTo: "TEST", eventType: "HANDOFF", message: `${featureName} 테스트 인계` };
  }
  if (action === "review_start") {
    return { agent: "TEST", handoffTo: "REVIEW", eventType: "HANDOFF", message: `${featureName} 리뷰 인계` };
  }
  if (action === "review_done") {
    return { agent: "REVIEW", handoffTo: "DOCS", eventType: "HANDOFF", message: `${featureName} 문서화 인계` };
  }
  if (action === "docs_done") {
    return { agent: "DOCS", handoffTo: "MAIN", eventType: "HANDOFF", message: `${featureName} 완료 처리 인계` };
  }
  return null;
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
    {
      userId: config.userId,
      workspace: event.workspaceName,
      ts: new Date().toISOString(),
      agent: event.agent,
      handoffTo: event.handoffTo,
      eventType: event.eventType,
      level: event.level,
      message: event.message,
      details: event.details,
    },
    ACTIVITY_TIMEOUT_MS,
  );
}
