import { describe, expect, it } from "vitest";
import { scheduleAttention, taskGuidance } from "./taskGuidance.js";

const now = Date.parse("2026-09-29T12:00:00.000Z");

describe("task guidance", () => {
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
      kind: "attention",
      currentStage: "미검증 완료",
      nextAction: "검증 결과 확인",
      action: "review_result",
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
  it("차단 > 확인 필요 > 진행중 > 완료 순서로 SPEC 상태를 결정한다", () => {
    const base = { status: "in_progress", has_run: true, task_count: 1, done_task_count: 0, active_task_count: 1, blocked_task_count: 0, unverified_task_count: 0 };
    expect(scheduleAttention({ ...base, blocked_task_count: 1 }).label).toBe("차단");
    expect(scheduleAttention({ ...base, stale_task_count: 1 }).label).toBe("확인 필요");
    expect(scheduleAttention(base).label).toBe("진행중");
    expect(scheduleAttention({ ...base, status: "done", active_task_count: 0, done_task_count: 1 }).label).toBe("완료");
  });
});
