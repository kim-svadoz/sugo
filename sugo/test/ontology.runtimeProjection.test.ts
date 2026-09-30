import { describe, expect, it } from "vitest";
import { LINK_TYPES } from "../src/ontology/model.js";
import { projectSessionOntology } from "../src/ontology/runtimeProjection.js";
import type { Task } from "../src/hulk/types.js";
import type { PlanSession } from "../src/types.js";

function session(overrides: Partial<PlanSession> = {}): PlanSession {
  return {
    id: "plan-1-abcd",
    state: "REVIEW_RUNNING",
    projectPath: "/project",
    featureName: "결제 안정화",
    startedAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T01:00:00.000Z",
    data: {
      mode: "patch",
      prdPath: "/project/sugo/features/payment/prd.md",
      hulkWorkspace: "payments",
      hulkTaskId: "task-payment",
      patch: { parentPrdPath: "/project/prd.md", version: 2, baseWorkResultPath: "/project/work-result.md", featureDir: "/project" },
      baselineGate: {
        required: true,
        signals: ["migration"],
        evidence: { kind: "baseline", command: "npm test", exitCode: 0, failed: 0, recordedAt: "2026-09-30T00:10:00.000Z", derivedState: "pass" },
      },
      chainInfo: {
        changedFiles: ["src/pay.ts"],
        analyzeAttempts: 1,
        analyzePassed: true,
        testPassedState: "pass",
        testEvidence: { kind: "feature", command: "npm test", exitCode: 0, failed: 0, recordedAt: "2026-09-30T00:30:00.000Z", derivedState: "pass" },
        reviewPassed: null,
        autoLoopRetryCount: 0,
        contractTests: [{ contractId: "payment", redExitCode: 1, greenExitCode: 0 }],
        lastValidation: { verdict: "pass", checkedAt: "2026-09-30T00:40:00.000Z", fabricatedCount: 0, contradictionCount: 0, autoVerifiedCount: 2, verifiedFailures: [] },
        runtimeVerified: true,
        workResultPath: "/project/work-result-patch-v2.md",
      },
      humanDecisionGate: {
        workspace: "payments",
        taskId: "task-payment",
        blocker: {
          schemaVersion: 1,
          sessionId: "plan-1-abcd",
          stage: "REVIEW_RUNNING",
          resumeAction: "review_done",
          summary: "승인 필요",
          question: "배포할까요?",
          context: ["검증 완료"],
          options: [{ id: "yes", label: "배포", impact: "진행" }],
          blockedNextStep: "문서화",
          createdAt: "2026-09-30T00:50:00.000Z",
        },
      },
    },
    ...overrides,
  };
}

describe("P1 runtime ontology projection", () => {
  it("실제 세션·Task 데이터에서 객체와 핵심 관계를 결정적으로 투영한다", () => {
    const task: Task = {
      id: "task-payment",
      title: "결제 안정화",
      project: "/project",
      status: "in_progress",
      created_at: "2026-09-29T00:00:00.000Z",
      patchInfo: { parentTaskId: "task-payment", patchVersion: 2 },
    };
    const result = projectSessionOntology(session(), task);

    expect(result.objects).toContainEqual(expect.objectContaining({ id: "session:plan-1-abcd", type: "session" }));
    expect(result.objects).toContainEqual(expect.objectContaining({ id: "task:task-payment", type: "task" }));
    expect(result.objects.some((object) => object.type === "evidence")).toBe(true);
    expect(result.objects.some((object) => object.type === "human_decision")).toBe(true);
    expect(result.objects.some((object) => object.type === "artifact")).toBe(true);
    expect(result.links).toContainEqual(expect.objectContaining({ type: "operates_on", from: "session:plan-1-abcd", to: "task:task-payment" }));
    expect(result.links).toContainEqual(expect.objectContaining({ type: "blocks", to: "session:plan-1-abcd" }));
    expect(result.links).toContainEqual(expect.objectContaining({ type: "resumes_at", to: "action:review_done" }));
    expect(result.links).toContainEqual(expect.objectContaining({ type: "derived_from", from: "task:task-payment", to: "task:task-payment" }));
    expect(result.diagnostics).toEqual([]);
  });

  it("없는 증거나 Task 관계를 꾸며내지 않고 진단으로 남긴다", () => {
    const minimal = session({
      state: "SCAN",
      data: { mode: "plan", chainInfo: { changedFiles: [], analyzeAttempts: 0, analyzePassed: null, testPassedState: null, reviewPassed: null, autoLoopRetryCount: 0 } },
    });
    const result = projectSessionOntology(minimal);
    expect(result.objects.map((object) => object.type)).toEqual(["session"]);
    expect(result.links).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "TASK_LINK_UNAVAILABLE" }));
  });

  it("투영된 모든 관계 type은 선언된 LINK_TYPES에 존재한다", () => {
    const declared = new Set<string>(LINK_TYPES.map((link) => link.name));
    const result = projectSessionOntology(session());
    for (const link of result.links) expect(declared.has(link.type), link.type).toBe(true);
  });
});
