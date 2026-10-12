import { describe, expect, it } from "vitest";
import { scheduleAttention, taskGuidance } from "./taskGuidance.js";

const now = Date.parse("2026-09-29T12:00:00.000Z");

describe("task guidance", () => {
  it("버전된 runtime assessment가 있으면 상태·단계·다음 행동을 추측하지 않고 그대로 사용한다", () => {
    expect(taskGuidance({
      status: "in_progress",
      runtime_assessment: {
        projectionSchemaVersion: 1, status: "blocked", currentStage: "REVIEW_RUNNING",
        nextActions: [], recommendedAction: null, humanDecisionRequired: true,
        blockers: ["배포 승인 필요"], evidence: [], blockingReason: "배포 승인 필요",
        blockedNextStep: "문서화", resumesAt: "review_done",
      },
    }, now)).toMatchObject({
      kind: "blocked",
      currentStage: "REVIEW_RUNNING",
      reason: "배포 승인 필요",
      nextAction: "결정 입력 후 review_done 재개",
      blockedNextStep: "문서화",
    });
  });

  it("리뷰 확인 차단은 REVIEW_RUNNING을 유지하고 결과 화면 재진입 행동을 제공한다", () => {
    expect(taskGuidance({
      status: "blocked",
      human_blocker: { kind: "review_confirmation" },
      runtime_assessment: {
        projectionSchemaVersion: 1, status: "blocked", currentStage: "REVIEW_RUNNING",
        nextActions: [], recommendedAction: null, humanDecisionRequired: true,
        blockers: ["사람 검토 대기"], evidence: [], blockingReason: "사람 검토 대기",
        blockedNextStep: "review_done", resumesAt: "review_done",
      },
    }, now)).toMatchObject({
      kind: "blocked",
      currentStage: "REVIEW_RUNNING",
      nextAction: "작업 결과 확인 열기",
      action: "open_review_confirmation",
    });
  });

  it("차단은 이유와 해소 전 진행 불가를 가장 먼저 보여준다", () => {
    expect(taskGuidance({ status: "blocked", note: "외부 API 정책 확인 대기" }, now)).toMatchObject({
      kind: "blocked",
      currentStage: "작업 차단",
      reason: "외부 API 정책 확인 대기",
      nextAction: "차단 원인 확인",
    });
  });

  it("6시간 이상 갱신 없는 진행 Task는 확인 필요로 승격한다", () => {
    expect(taskGuidance({ status: "in_progress", updated_at: "2026-09-29T05:00:00.000Z" }, now)).toMatchObject({
      kind: "attention",
      currentStage: "진행 정체",
      nextAction: "작업 세션 상태 확인",
    });
  });

  it("미검증 완료는 PR/Patch보다 검증 결과 확인을 우선한다", () => {
    expect(taskGuidance({ status: "done", work_result: { report: { completionGrade: "unverified" } } }, now)).toMatchObject({
      kind: "verification",
      currentStage: "사람 검증 대기",
      nextAction: "미검증 사유 검토",
      action: "review_verification",
    });
  });

  it("실패한 테스트가 기록된 완료 작업은 수정 작업 복귀를 최우선으로 제안한다", () => {
    expect(taskGuidance({
      status: "done",
      work_result: { path: "work/work-result.md", report: { completionGrade: "unverified", verification: { test: { state: "fail" } } } },
    }, now)).toMatchObject({
      kind: "attention",
      currentStage: "테스트 실패",
      nextAction: "수정 작업으로 복귀",
      action: "continue_patch",
    });
  });

  it("검증 완료 후 PR 정보가 있으면 하나의 다음 행동으로 PR 생성을 고른다", () => {
    expect(taskGuidance({ status: "done", work_result: { path: "work/work-result.md", prRefs: { repoSlug: "api" }, report: { completionGrade: "verified" } } }, now)).toMatchObject({
      kind: "done",
      nextAction: "PR 생성",
      action: "create_pr",
    });
  });
});

describe("schedule attention", () => {
  it("SPEC 원문이 준비된 초안은 간결하게 준비로 표시한다", () => {
    expect(scheduleAttention({ status: "pending", spec_path: "spec.md" }).label).toBe("준비");
  });

  it("차단 > 확인 필요 > 진행중 > 완료 순서로 SPEC 상태를 결정한다", () => {
    const base = { status: "in_progress", has_run: true, task_count: 1, done_task_count: 0, active_task_count: 1, blocked_task_count: 0, unverified_task_count: 0 };
    expect(scheduleAttention({ ...base, blocked_task_count: 1 }).label).toBe("차단");
    expect(scheduleAttention({ ...base, stale_task_count: 1 }).label).toBe("확인 필요");
    expect(scheduleAttention(base).label).toBe("진행중");
    expect(scheduleAttention({ ...base, status: "done", active_task_count: 0, done_task_count: 1 }).label).toBe("완료");
  });
});

 it("DONE 파이프라인에서도 미검증 등급의 원인 검토를 안내한다", () => {
   expect(taskGuidance({ status: "done", work_result: { report: { completionGrade: "unverified" } }, runtime_assessment: { projectionSchemaVersion: 1, status: "completed", currentStage: "DONE", nextActions: [], recommendedAction: null, humanDecisionRequired: false, blockers: [], evidence: [] } })).toMatchObject({ kind: "verification", currentStage: "사람 검증 대기", nextAction: "미검증 사유 검토", action: "review_verification" });
 });


it.each(["verified", "verified_by_human"])("완료 상태 표시는 검증 방식(%s)과 관계없이 완료다", grade => {
  const runtime_assessment = { projectionSchemaVersion: 1 as const, status: "completed" as const, currentStage: "DONE", nextActions: [], recommendedAction: null, humanDecisionRequired: false, blockers: [], evidence: [] };
  const work_result = { report: { completionGrade: grade } };
  expect(taskGuidance({ status: "done", runtime_assessment, work_result })).toMatchObject({ kind: "done", label: "완료", action: "none" });
  expect(scheduleAttention({ status: "done", has_run: true, focus_task_status: "done", focus_task_runtime_assessment: runtime_assessment, focus_task_work_result: work_result })).toMatchObject({ kind: "done", label: "완료" });
});

it("완료 결과가 있는 patch를 취소하면 Schedule은 마지막 완료 상태를 유지한다", () => {
  const runtime_assessment = { projectionSchemaVersion: 1 as const, status: "cancelled" as const, currentStage: "REVIEW_RUNNING", nextActions: [], recommendedAction: null, humanDecisionRequired: false, blockers: [], evidence: [] };
  const work_result = { report: { completionGrade: "verified" } };
  expect(scheduleAttention({ status: "done", has_run: true, focus_task_status: "done", focus_task_runtime_assessment: runtime_assessment, focus_task_work_result: work_result })).toMatchObject({ kind: "done", label: "완료", action: "none" });
});
