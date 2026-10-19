import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanSession } from "../src/types.js";
import { validateOperationalContract } from "../src/ontology/contractValidation.js";
import { explainSessionState, traceTaskArtifacts } from "../src/ontology/operationalQueries.js";
import { projectSessionOntology } from "../src/ontology/runtimeProjection.js";
import { ACTION_TYPES } from "../src/ontology/model.js";
import type { RoadmapNode, Task } from "../src/work/types.js";

const FIXTURES = join(__dirname, "fixtures", "ontology");
const PLUGIN_ROOT = join(__dirname, "..");

function prompt(relativePath: string): string {
  return readFileSync(join(PLUGIN_ROOT, relativePath), "utf8");
}

function expectInOrder(text: string, values: readonly string[]): void {
  let cursor = -1;
  for (const value of values) {
    const next = text.indexOf(value, cursor + 1);
    expect(next, `missing or out of order: ${value}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe("operational ontology 통합 계약", () => {
  it("모델 실행 프롬프트가 온톨로지 전이 순서와 핵심 게이트 계약을 보존한다", () => {
    const feat = prompt("commands/feat.md");
    const pipelineActions = ACTION_TYPES
      .map((action) => action.name)
      .filter((name) => !["oracle_done", "jira", "subtask_start", "subtask_done", "integrate", "test_reverify", "status", "cancel"].includes(name));

    expectInOrder(feat, pipelineActions);
    for (const gateId of [
      "SPEC_DRAFT_SELECTION_REQUIRED",
      "TODO_SPEC_DRAFT_CONFIRMATION_REQUIRED",
      "GATE_KEEPER_BLOCKED",
      "TODO_SPEC_SYNC_REQUIRED",
      "TODO_SPEC_MISSING_AT_COMMIT",
    ]) expect(feat).toContain(gateId);

    const review = prompt("skills/review-validate/SKILL.md");
    for (const gateId of [
      "VALIDATE_NOT_CALLED",
      "VALIDATE_VERIFIED_FAILURE",
      "LETHAL_TRIFECTA_NOT_CALLED",
      "LETHAL_TRIFECTA_MITIGATION_REQUIRED",
      "RUNTIME_CLAIM_CONTRADICTS_EVIDENCE",
      "LABEL_CONTRADICTION",
      "RUNTIME_UNVERIFIED_GATE_FAILED",
      "REVERIFY_EVIDENCE_STILL_FAIL",
    ]) expect(review).toContain(gateId);

    const specWriter = prompt("skills/spec-writer/SKILL.md");
    expectInOrder(specWriter, ["`배경/목적`", "`범위`", "`요구사항`", "`완료조건`", "`제약`", "`Open Questions`", "`Sources`"]);
    for (const contract of ["SPEC_NOT_EDITABLE", "SPEC_LINT_WARNINGS", "acceptLintWarnings:true", "specTarget.path"]) {
      expect(specWriter).toContain(contract);
    }

    const patchAttach = prompt("commands/patch-attach.md");
    for (const contract of ["patchProvenance:\"captured-post-hoc\"", "postHocBaseRevision", "postHocChangedFiles", "POST_HOC_BASELINE_REQUIRED", "POST_HOC_SCOPE_REQUIRED", "POST_HOC_DUPLICATE", "POST_HOC_LINEAGE_NOT_FOUND"]) {
      expect(patchAttach).toContain(contract);
    }
  });

  it("적대적 입력 기준 목록이 모델 게이트와 실제 증명 테스트에 전부 연결된다", () => {
    const rows = JSON.parse(readFileSync(join(FIXTURES, "rejection-cases.json"), "utf8")) as {
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

    expect(rows.map((row) => row.id)).toEqual(expectedRows);
    for (const row of rows) {
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

  it("이전 형식의 session/work-result를 현재 모델이 거짓 전이 없이 설명한다", () => {
    const session = JSON.parse(readFileSync(join(FIXTURES, "prior-format-session.json"), "utf8")) as PlanSession;
    const workResult = readFileSync(join(FIXTURES, "prior-format-work-result.md"), "utf8");
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
