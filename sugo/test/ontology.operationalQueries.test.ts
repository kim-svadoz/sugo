import { describe, expect, it } from "vitest";
import {
  explainSessionBlock,
  explainSessionState,
  projectNextActions,
  traceTaskArtifacts,
} from "../src/ontology/operationalQueries.js";
import type { RoadmapNode, Task } from "../src/work/types.js";
import type { PlanSession } from "../src/types.js";
import { explanationProfileContract } from "../src/ontology/explanationProfile.js";

function session(overrides: Partial<PlanSession> = {}): PlanSession {
  return {
    id: "plan-query-1",
    state: "REVIEW_RUNNING",
    projectPath: "/project",
    featureName: "결제 안정화",
    startedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T01:00:00.000Z",
    data: {
      mode: "plan",
      prdPath: "/project/sugo/features/payment/prd.md",
      linkedWorkspace: "payments",
      linkedTaskId: "task-payment",
      lastTransition: { action: "review_start", fromState: "TEST_DONE", toState: "REVIEW_RUNNING", recordedAt: "2026-10-01T00:55:00.000Z" },
      chainInfo: {
        changedFiles: ["src/pay.ts"], analyzeAttempts: 1, analyzePassed: true,
        testPassedState: "pass", reviewPassed: null, autoLoopRetryCount: 0,
        testEvidence: { kind: "feature", command: "npm test", exitCode: 0, failed: 0, recordedAt: "2026-10-01T00:40:00.000Z", derivedState: "pass" },
        lastValidation: { verdict: "pass", checkedAt: "2026-10-01T00:50:00.000Z", fabricatedCount: 0, contradictionCount: 0, autoVerifiedCount: 2, verifiedFailures: [] },
        runtimeVerified: true,
        workResultPath: "/project/work-result.md",
      },
    },
    ...overrides,
  };
}

describe("P3 operational ontology queries", () => {
  it("설명 프로필은 사실을 재계산하지 않고 언어별 준수 한계를 명시한다", () => {
    expect(explanationProfileContract("ste-inspired-ko")).toMatchObject({
      language: "ko", compliance: "principles-applied", sourceOfTruth: "result",
    });
    expect(explanationProfileContract("asd-ste100-en")).toMatchObject({
      language: "en", compliance: "unverified-until-qualified-review", sourceOfTruth: "result",
    });
  });

  it("explain_state는 서버가 기록한 마지막 전이와 현재 증거를 반환한다", () => {
    const result = explainSessionState(session());
    expect(result).toMatchObject({
      querySchemaVersion: 1,
      sessionId: "plan-query-1",
      currentState: "REVIEW_RUNNING",
      enteredBy: { recorded: true, action: "review_start", fromState: "TEST_DONE", toState: "REVIEW_RUNNING" },
    });
    expect(result.evidence).toContainEqual(expect.objectContaining({ id: "validation", status: "present" }));
  });

  it("과거 세션은 마지막 전이를 꾸며내지 않고 후보로만 표시한다", () => {
    const legacy = session({ data: { ...session().data, lastTransition: undefined } });
    expect(explainSessionState(legacy).enteredBy).toMatchObject({
      recorded: false,
      inferredCandidates: ["review_start"],
    });
  });

  it("explain_block은 사람 결정과 미결정 영향을 한 구조로 반환한다", () => {
    const blocked = session({
      data: {
        ...session().data,
        humanDecisionGate: {
          workspace: "payments", taskId: "task-payment",
          blocker: {
            schemaVersion: 1, sessionId: "plan-query-1", stage: "REVIEW_RUNNING", resumeAction: "review_done",
            summary: "배포 승인 필요", question: "배포할까요?", context: ["테스트 통과"],
            options: [{ id: "yes", label: "진행", impact: "문서화로 이동" }], blockedNextStep: "문서화",
            createdAt: "2026-10-01T00:59:00.000Z",
          },
        },
      },
    });
    expect(explainSessionBlock(blocked)).toMatchObject({
      blocked: true,
      reason: "배포 승인 필요",
      requiredHumanDecision: { question: "배포할까요?" },
      unresolvedImpact: "문서화",
      resumesAt: "review_done",
    });
  });

  it("next_actions는 선언된 전제·목표상태·게이트를 action별로 제공한다", () => {
    const actions = projectNextActions(session({ data: { ...session().data, humanDecisionGate: undefined } }));
    expect(actions.actions).toContainEqual(expect.objectContaining({
      action: "review_done",
      isRecommended: true,
      prerequisites: ["REVIEW_RUNNING"],
      effect: { targetState: "DOCS_PENDING", keepsCurrentState: false, sessionOutcome: "continues" },
      gates: expect.arrayContaining([expect.objectContaining({ gateId: "VALIDATE_NOT_CALLED" })]),
    }));
  });

  it("trace_artifact는 Spec→Run→Task와 실제 evidence/work-result만 연결한다", () => {
    const task: Task = { id: "task-payment", title: "결제 안정화", project: "/project", status: "in_progress", created_at: "2026-10-01T00:00:00.000Z", prd_ref: "/project/sugo/features/payment/prd.md" };
    const nodes: RoadmapNode[] = [
      { id: "spec-payment", title: "결제", level: "spec", status: "in_progress", dependsOn: [] },
      { id: "run-payment", title: "최초 구현", level: "workstream", status: "in_progress", dependsOn: [], parent: "spec-payment" },
      { id: "task-payment", title: "결제 안정화", level: "task", status: "in_progress", dependsOn: [], parent: "run-payment" },
    ];
    const result = traceTaskArtifacts(session(), task, nodes);
    expect(result.hierarchy.map((node) => node.level)).toEqual(["spec", "workstream", "task"]);
    expect(result.artifacts).toContainEqual(expect.objectContaining({ label: "PRD" }));
    expect(result.artifacts).toContainEqual(expect.objectContaining({ label: "Work Result" }));
    expect(result.evidence).toContainEqual(expect.objectContaining({ label: "Test evidence" }));
  });

  it("연결 세션이 없는 Task도 resolver가 찾은 workspace를 잃지 않는다", () => {
    const task: Task = { id: "task-unstarted", title: "미착수 작업", project: "/project", status: "pending", created_at: "2026-10-01T00:00:00.000Z" };
    const nodes: RoadmapNode[] = [
      { id: "spec-unstarted", title: "미착수 Spec", level: "spec", status: "pending", dependsOn: [] },
      { id: "run-unstarted", title: "초기 Run", level: "workstream", status: "pending", dependsOn: [], parent: "spec-unstarted" },
      { id: "task-unstarted", title: "미착수 작업", level: "task", status: "pending", dependsOn: [], parent: "run-unstarted" },
    ];

    const result = traceTaskArtifacts(null, task, nodes, "payments");

    expect(result.workspace).toBe("payments");
    expect(result.sessionId).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "SESSION_FOR_TASK_NOT_FOUND" }));
  });
});
