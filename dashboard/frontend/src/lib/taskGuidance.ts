type WorkResultLike = {
  path?: string;
  prRefs?: unknown;
  report?: { completionGrade?: string; verification?: { test?: { state?: string } } };
} | null;

export type GuidanceKind = "draft" | "ready" | "in_progress" | "blocked" | "attention" | "done" | "pending";
export type GuidanceAction = "open_canvas" | "review_result" | "create_pr" | "continue_patch" | "write_spec" | "start_feat" | "none";

export interface RuntimeAssessment {
  projectionSchemaVersion: 1;
  status: "in_progress" | "blocked" | "completed" | "cancelled";
  currentStage: string;
  nextActions: string[];
  recommendedAction: string | null;
  humanDecisionRequired: boolean;
  blockers: string[];
  evidence: unknown[];
  blockingReason?: string;
  blockedNextStep?: string;
  resumesAt?: string;
}

export interface TaskGuidanceInput {
  status: string;
  manual_status?: string | null;
  note?: string | null;
  updated_at?: string | null;
  work_result?: WorkResultLike | unknown;
  runtime_assessment?: RuntimeAssessment | null;
}

export interface TaskGuidance {
  kind: GuidanceKind;
  label: string;
  currentStage: string;
  reason: string;
  nextAction: string;
  blockedNextStep: string;
  action: GuidanceAction;
}

export const STALE_ATTENTION_HOURS = 6;

function parsedWorkResult(value: unknown): WorkResultLike {
  if (!value) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value) as WorkResultLike; } catch { return null; }
  }
  return value as WorkResultLike;
}

function ageHours(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const parsed = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed) ? null : Math.max(0, (now - parsed) / 3_600_000);
}

const ACTION_LABELS: Record<string, string> = {
  prd: "SPEC 작성",
  baseline_capture: "Baseline 증거 기록",
  contract_done: "계약 테스트 완료",
  code_done: "구현 완료",
  test_done: "테스트 완료",
  review_done: "검증 완료",
  commit: "Work Result 작성",
};

function guidanceFromAssessment(assessment: RuntimeAssessment): TaskGuidance {
  const kind: GuidanceKind = assessment.status === "blocked"
    ? "blocked"
    : assessment.status === "completed"
      ? "done"
      : assessment.status === "cancelled"
        ? "attention"
        : "in_progress";
  const label = assessment.status === "blocked" ? "차단"
    : assessment.status === "completed" ? "완료"
      : assessment.status === "cancelled" ? "취소됨" : "진행중";
  const reason = assessment.blockingReason
    ?? assessment.blockers[0]
    ?? (assessment.status === "completed" ? "Sugo 파이프라인이 완료되었습니다."
      : assessment.status === "cancelled" ? "작업 세션이 취소되었습니다."
        : "Sugo 파이프라인이 다음 게이트를 기다리고 있습니다.");
  const nextAction = assessment.humanDecisionRequired && assessment.resumesAt
    ? `결정 입력 후 ${assessment.resumesAt} 재개`
    : assessment.recommendedAction
      ? (ACTION_LABELS[assessment.recommendedAction] ?? assessment.recommendedAction)
      : assessment.status === "completed" ? "완료 결과 확인" : "상태 확인";
  return {
    kind,
    label,
    currentStage: assessment.currentStage,
    reason,
    nextAction,
    blockedNextStep: assessment.blockedNextStep
      ?? (assessment.status === "blocked" ? "결정이 반영되기 전에는 다음 단계로 진행하지 않습니다."
        : assessment.status === "completed" ? "추가 변경이 없다면 별도 행동은 필요하지 않습니다."
          : "현재 게이트가 완료되기 전에는 다음 단계로 진행하지 않습니다."),
    action: assessment.status === "cancelled" ? "none" : "open_canvas",
  };
}

export function taskGuidance(node: TaskGuidanceInput, now = Date.now()): TaskGuidance {
  if (node.runtime_assessment?.projectionSchemaVersion === 1) {
    const guidance = guidanceFromAssessment(node.runtime_assessment);
    if (node.runtime_assessment.status === "completed") {
      const grade = parsedWorkResult(node.work_result)?.report?.completionGrade;
      if (grade === "unverified") return { ...guidance, kind: "attention", label: "미검증", reason: "작업은 완료됐지만 검증 예외가 남아 있습니다. 완료등급 아래의 사유를 검토하세요.", nextAction: "미검증 사유 검토" };
      if (grade === "verified" || grade === "verified_by_human") return { ...guidance, label: grade === "verified" ? "검증 완료" : "사람 승인 검증완료", nextAction: "추가 작업 없음", action: "none" };
    }
    return guidance;
  }
  const status = (node.manual_status ?? node.status ?? "pending").toLowerCase();
  const workResult = parsedWorkResult(node.work_result);
  const staleHours = status === "in_progress" ? ageHours(node.updated_at, now) : null;

  if (status === "blocked") {
    return {
      kind: "blocked", label: "차단", currentStage: "작업 차단",
      reason: node.note?.trim() || "차단 상태로 표시되었지만 상세 이유가 기록되지 않았습니다.",
      nextAction: "차단 원인 확인", blockedNextStep: "원인을 해소하기 전에는 다음 단계로 진행하지 않습니다.", action: "open_canvas",
    };
  }
  if (status === "in_progress" && staleHours !== null && staleHours >= STALE_ATTENTION_HOURS) {
    return {
      kind: "attention", label: "확인 필요", currentStage: "진행 정체",
      reason: `${Math.floor(staleHours)}시간 동안 Task 상태가 갱신되지 않았습니다.`,
      nextAction: "작업 세션 상태 확인", blockedNextStep: "확인 전까지 현재 진행 상태가 실제 작업과 일치하는지 알 수 없습니다.", action: "open_canvas",
    };
  }
  if (status === "in_progress") {
    return {
      kind: "in_progress", label: "진행중", currentStage: "Task 진행 중",
      reason: node.note?.trim() || "Sugo 파이프라인이 이 Task를 진행하고 있습니다.",
      nextAction: "실행 Task 확인", blockedNextStep: "현재 작업이 완료될 때까지 후속 Patch와 PR 단계는 열리지 않습니다.", action: "open_canvas",
    };
  }
  if (status === "done" && workResult?.report?.verification?.test?.state === "fail") {
    return {
      kind: "attention", label: "확인 필요", currentStage: "테스트 실패",
      reason: "완료 보고서에 실패한 테스트가 기록되어 있습니다.",
      nextAction: "수정 작업으로 복귀", blockedNextStep: "실패 원인을 수정하기 전에는 검증 완료로 판단하지 않습니다.",
      action: workResult.path ? "continue_patch" : "review_result",
    };
  }
  if (status === "done" && workResult?.report?.completionGrade === "unverified") {
    return {
      kind: "attention", label: "확인 필요", currentStage: "미검증 완료",
      reason: "완료 결과에 미검증 항목이 남아 있습니다.",
      nextAction: "검증 결과 확인", blockedNextStep: "확인 없이 후속 작업을 선택하면 미검증 결과를 기준으로 진행하게 됩니다.", action: "review_result",
    };
  }
  if (status === "done" && workResult?.prRefs) {
    return {
      kind: "done", label: "완료", currentStage: "검증 완료",
      reason: "작업 결과와 PR 대상 저장소 정보가 준비되었습니다.",
      nextAction: "PR 생성", blockedNextStep: "PR을 만들기 전까지 변경사항은 원격 리뷰 흐름에 들어가지 않습니다.", action: "create_pr",
    };
  }
  if (status === "done" && workResult?.path) {
    return {
      kind: "done", label: "완료", currentStage: "작업 완료",
      reason: "완료 산출물이 준비되었습니다.",
      nextAction: "Patch 이어가기", blockedNextStep: "추가 변경이 없다면 별도 행동은 필요하지 않습니다.", action: "continue_patch",
    };
  }
  if (status === "done") {
    return {
      kind: "done", label: "완료", currentStage: "작업 완료",
      reason: "Task가 완료 상태입니다.", nextAction: "완료 결과 확인",
      blockedNextStep: "추가 변경이 없다면 별도 행동은 필요하지 않습니다.", action: "review_result",
    };
  }
  return {
    kind: "pending", label: "대기", currentStage: "착수 대기",
    reason: node.note?.trim() || "아직 실행 중인 Task가 아닙니다.", nextAction: "선행 작업 확인",
    blockedNextStep: "선행 조건이 완료될 때까지 이 Task는 시작되지 않습니다.", action: "open_canvas",
  };
}

export interface ScheduleAttentionInput {
  status: string;
  has_run: boolean;
  spec_path?: string | null;
  task_count?: number;
  done_task_count?: number;
  active_task_count?: number;
  blocked_task_count?: number;
  stale_task_count?: number;
  unverified_task_count?: number;
  focus_task_status?: string | null;
  focus_task_note?: string | null;
  focus_task_updated_at?: string | null;
  focus_task_work_result?: unknown;
  focus_task_runtime_assessment?: RuntimeAssessment | null;
}

export function scheduleAttention(spec: ScheduleAttentionInput, now = Date.now()): TaskGuidance {
  if (spec.focus_task_runtime_assessment?.projectionSchemaVersion === 1) {
    return taskGuidance({
      status: spec.focus_task_status ?? "pending",
      work_result: spec.focus_task_work_result,
      runtime_assessment: spec.focus_task_runtime_assessment,
    }, now);
  }
  if ((spec.blocked_task_count ?? 0) > 0) {
    return taskGuidance({ status: "blocked", note: spec.focus_task_note }, now);
  }
  if ((spec.stale_task_count ?? 0) > 0) {
    return taskGuidance({ status: "in_progress", updated_at: spec.focus_task_updated_at ?? new Date(now - STALE_ATTENTION_HOURS * 3_600_000).toISOString() }, now);
  }
  if ((spec.unverified_task_count ?? 0) > 0) {
    return taskGuidance({ status: "done", work_result: spec.focus_task_work_result ?? { report: { completionGrade: "unverified" } } }, now);
  }
  if ((spec.active_task_count ?? 0) > 0) {
    return taskGuidance({ status: "in_progress", note: spec.focus_task_note, updated_at: spec.focus_task_updated_at }, now);
  }
  if (spec.status === "done" || ((spec.task_count ?? 0) > 0 && spec.done_task_count === spec.task_count)) {
    return taskGuidance({ status: "done", work_result: spec.focus_task_work_result }, now);
  }
  if (spec.has_run) {
    return {
      kind: "attention", label: "확인 필요", currentStage: "실행 상태 불일치",
      reason: "RUN은 연결되어 있지만 진행 중이거나 완료된 Task가 없습니다.", nextAction: "Canvas 상태 확인",
      blockedNextStep: "Task 상태를 확인하기 전에는 다음 행동을 정확히 제안할 수 없습니다.", action: "open_canvas",
    };
  }
  if (spec.spec_path) {
    return {
      kind: "ready", label: "준비", currentStage: "SPEC 작성 완료", reason: "feat를 시작할 준비가 되었습니다.",
      nextAction: "feat 시작", blockedNextStep: "feat를 시작하기 전까지 구현 Task는 생성되지 않습니다.", action: "start_feat",
    };
  }
  return {
    kind: "draft", label: "초안", currentStage: "SPEC 일정 초안", reason: "구현 가능한 SPEC 원문이 아직 없습니다.",
    nextAction: "SPEC 작성", blockedNextStep: "SPEC이 작성되기 전에는 feat를 시작할 수 없습니다.", action: "write_spec",
  };
}
