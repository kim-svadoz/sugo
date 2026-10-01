import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanSession } from "../src/types.js";
import { validateOperationalContract } from "../src/ontology/contractValidation.js";
import { explainSessionState, traceTaskArtifacts } from "../src/ontology/operationalQueries.js";
import { projectSessionOntology } from "../src/ontology/runtimeProjection.js";
import { ACTION_TYPES } from "../src/ontology/model.js";
import type { RoadmapNode, Task } from "../src/hulk/types.js";

const FIXTURES = join(__dirname, "fixtures", "ontology");

describe("P4 operational ontology 통합 계약", () => {
  it("설계안 16행 독립 골든 코퍼스가 모델 게이트와 실제 증명 테스트에 전부 연결된다", () => {
    const corpus = JSON.parse(readFileSync(join(FIXTURES, "appendix-b-corpus.json"), "utf8")) as {
      id: string;
      modelGateIds: string[];
      proofFiles: string[];
    }[];
    const expectedRows = [
      "order", "four-layer-consistency", "baseline", "contract", "analyze", "test-evidence", "wiring",
      "registration-glue", "boot", "user-confirmation", "summary-quality", "runtime", "prd-coverage",
      "label-guard", "evidence-reuse", "req-completion"
    ];
    const declaredGateIds = new Set<string>(ACTION_TYPES.flatMap((action) => action.gates.map((gate) => gate.gateId)));

    expect(corpus.map((row) => row.id)).toEqual(expectedRows);
    for (const row of corpus) {
      for (const gateId of row.modelGateIds) expect(declaredGateIds.has(gateId), `${row.id}: ${gateId}`).toBe(true);
      expect(row.proofFiles.length, `${row.id}: proof`).toBeGreaterThan(0);
      for (const proofFile of row.proofFiles) expect(readFileSync(join(__dirname, proofFile), "utf8").length).toBeGreaterThan(0);
    }
  });

  it("실제 전이를 기록한 세션은 선언·assessment·projection·query가 모두 일치한다", () => {
    const session: PlanSession = {
      id: "plan-integrated", state: "TEST_DONE", projectPath: "/project", featureName: "checkout",
      startedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:10:00.000Z",
      data: {
        mode: "plan",
        lastTransition: { action: "test_done", fromState: "TEST_RUNNING", toState: "TEST_DONE", recordedAt: "2026-10-01T00:10:00.000Z" },
        chainInfo: {
          changedFiles: [], analyzeAttempts: 1, analyzePassed: true, testPassedState: "pass", reviewPassed: null,
          autoLoopRetryCount: 0,
          testEvidence: { kind: "feature", command: "npm test", exitCode: 0, failed: 0, recordedAt: "2026-10-01T00:09:00.000Z", derivedState: "pass" }
        }
      }
    };

    expect(validateOperationalContract(session)).toEqual({ valid: true, violations: [] });
  });

  it("독립 적대 fixture가 거짓 전이 기록과 projection drift를 잡는다", () => {
    const session: PlanSession = {
      id: "plan-adversarial", state: "REVIEW_RUNNING", projectPath: "/project", featureName: "checkout",
      startedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:10:00.000Z",
      data: {
        mode: "plan",
        lastTransition: { action: "code_done", fromState: "CODE_RUNNING", toState: "TEST_DONE", recordedAt: "2026-10-01T00:10:00.000Z" },
        chainInfo: { changedFiles: [], analyzeAttempts: 1, analyzePassed: true, testPassedState: "pass", reviewPassed: null, autoLoopRetryCount: 0 }
      }
    };

    expect(validateOperationalContract(session)).toEqual({
      valid: false,
      violations: expect.arrayContaining([
        expect.objectContaining({ code: "TRANSITION_TARGET_MISMATCH" }),
        expect.objectContaining({ code: "TRANSITION_DECLARATION_MISMATCH" })
      ])
    });
  });

  it("v0.10 과거 session/work-result를 최신 모델이 거짓 전이 없이 설명한다", () => {
    const session = JSON.parse(readFileSync(join(FIXTURES, "legacy-session-v010.json"), "utf8")) as PlanSession;
    const workResult = readFileSync(join(FIXTURES, "legacy-work-result-v010.md"), "utf8");
    const task: Task = { id: "task-legacy-checkout", title: "legacy checkout", project: session.projectPath, status: "done", created_at: session.startedAt };
    const nodes: RoadmapNode[] = [
      { id: "spec-legacy", title: "legacy", level: "spec", status: "done", dependsOn: [] },
      { id: "run-legacy", title: "first", level: "workstream", status: "done", dependsOn: [], parent: "spec-legacy" },
      { id: task.id, title: task.title, level: "task", status: "done", dependsOn: [], parent: "run-legacy", workResult: { path: session.data.chainInfo.workResultPath, summary: workResult.split("\n")[0] } }
    ];

    expect(validateOperationalContract(session)).toEqual({ valid: true, violations: [] });
    expect(explainSessionState(session).enteredBy).toMatchObject({ recorded: false, inferredCandidates: ["commit"] });
    expect(projectSessionOntology(session, task).objects).toContainEqual(expect.objectContaining({ type: "artifact", label: "Work Result" }));
    expect(traceTaskArtifacts(session, task, nodes, "legacy-workspace")).toMatchObject({
      hierarchy: [{ level: "spec" }, { level: "workstream" }, { level: "task" }],
      roadmapWorkResult: { path: session.data.chainInfo.workResultPath }
    });
  });
});
