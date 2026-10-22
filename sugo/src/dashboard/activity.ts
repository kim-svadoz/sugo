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

export interface ActivityTransitionContext {
  changedFiles?: string[];
  testSummary?: string;
  reviewSummary?: string;
  workResultPath?: string;
}

/**
 * 상태머신의 성공 전이를 Live Console handoff의 정본으로 바꾼다.
 * sugo_chain은 프롬프트 전달 보조 수단이라 호출이 생략될 수 있으므로 관측 로그의 근거로 쓰지 않는다.
 */
export function activityForPlanTransition(action: string, fromState: string, featureName: string, context: ActivityTransitionContext = {}): HandoffActivity | null {
  const changed = context.changedFiles?.length ? `${context.changedFiles.length}개 파일 변경` : "구현 결과 기록";
  if (action === "code_start") {
    const agent: ActivityAgent = fromState === "REVIEW_RUNNING" ? "REVIEW" : fromState === "TEST_DONE" ? "TEST" : "MAIN";
    return {
      agent,
      handoffTo: "CODE",
      eventType: "HANDOFF",
      message: agent === "MAIN" ? `${featureName} 구현 시작 · 목표와 적용 규칙 확인` : `${featureName} 재구현 시작 · 검토 피드백 반영`,
    };
  }
  if (action === "test_start") {
    return { agent: "CODE", handoffTo: "TEST", eventType: "HANDOFF", message: `${featureName} 구현 완료 · ${changed}` };
  }
  if (action === "review_start") {
    return { agent: "TEST", handoffTo: "REVIEW", eventType: "HANDOFF", message: `${featureName} 검증 완료 · ${context.testSummary ?? "테스트 증거 확인"}` };
  }
  if (action === "review_done") {
    return { agent: "REVIEW", handoffTo: "DOCS", eventType: "HANDOFF", message: `${featureName} 사용자 확인 완료 · ${context.reviewSummary ?? "검토 결과 승인"}` };
  }
  if (action === "docs_done") {
    return { agent: "DOCS", handoffTo: "MAIN", eventType: "HANDOFF", message: `${featureName} 문서화 완료 · ${context.workResultPath ?? "작업 결과 기록 저장"} · 커밋 준비` };
  }
  return null;
}

const ACTIVITY_TIMEOUT_MS = 3000;

/**
 * Activity Stream: `POST /api/activity/ingest`. 완전 논블로킹(3s) — 실패는
 * pushEvent가 재시도 큐로 흡수하므로 이 함수도 절대 던지지 않는다. 태스크 완료·에이전트
 * 핸드오프 시점에 호출한다.
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
