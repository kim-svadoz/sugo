import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoValidate } from "../src/tools/sugoValidate.js";
import { handleSugoRoadmap } from "../src/tools/sugoRoadmap.js";
import { loadSession } from "../src/session.js";
import { validateOperationalContract } from "../src/ontology/contractValidation.js";
import { explainSessionBlock } from "../src/ontology/operationalQueries.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const HEADING_PRD = "### REQ-1: 이메일 로그인\n" + "가".repeat(90) + "\n### REQ-2: 소셜 로그인\n" + "나".repeat(20);
const GOOD_SUMMARY = [
  "배경: 사용자가 이메일/소셜 로그인을 할 수 없는 문제가 있었다.",
  "변경: EmailLoginService와 SocialLoginService를 추가했다.",
  "설계: 기존 인증 흐름을 재사용했다.",
  "테스트: 단위테스트 전부 통과를 확인했다.",
].join("\n");

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-roadmap-e2e-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-roadmap-e2e-project-"));
  writeFileSync(join(projectDir, "package.json"), "{}\n");
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.SUGO_DASHBOARD_API_URL;
  delete process.env.SUGO_DASHBOARD_USER_ID;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

async function toReadyAndBeyond(prd: string): Promise<{ sessionId: string; taskId: string }> {
  await call(handleSugoAdd, { projectPath: projectDir, workspace: "team-a" });
  const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  const prdResult = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: prd });
  expect(prdResult.isError).toBe(false);
  await call(handleSugoPlan, { action: "ready", sessionId });
  await call(handleSugoPlan, { action: "baseline_capture", sessionId });
  await call(handleSugoPlan, { action: "contract_start", sessionId });
  await call(handleSugoPlan, { action: "contract_done", sessionId });
  const roadmap = await call(handleSugoRoadmap, { action: "list", workspace: "team-a" });
  const taskId = roadmap.data.nodes.find((n: { level: string }) => n.level === "task").id as string;
  return { sessionId, taskId };
}

async function approveDashboardReview(sessionId: string, taskId: string): Promise<void> {
  const requested = await call(handleSugoRoadmap, {
    action: "request_review_confirmation",
    workspace: "team-a",
    id: taskId,
    sessionId,
    reviewPacket: {
      summary: "로그인 구현과 검증을 마쳤습니다.",
      changes: ["이메일 로그인 추가"],
      tests: ["npm test 통과"],
      designDecisions: ["기존 인증 흐름 재사용"],
      knownLimitations: [],
    },
  });
  expect(requested.isError).toBe(false);
  const dashboard = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      status: "blocked",
      blocker: { sessionId, resumeAction: "review_done" },
      decision: { response: "확인, 진행", answered_by: "tester", answered_at: "2026-10-01T00:00:00.000Z" },
    }));
  });
  await new Promise<void>((resolve) => dashboard.listen(0, "127.0.0.1", resolve));
  try {
    const address = dashboard.address();
    if (!address || typeof address === "string") throw new Error("test dashboard address unavailable");
    process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUGO_DASHBOARD_USER_ID = "tester";
    const resumed = await call(handleSugoRoadmap, { action: "resume_with_decision", workspace: "team-a", id: taskId, sessionId });
    expect(resumed.isError).toBe(false);
  } finally {
    delete process.env.SUGO_DASHBOARD_API_URL;
    delete process.env.SUGO_DASHBOARD_USER_ID;
    await new Promise<void>((resolve, reject) => dashboard.close((error) => error ? reject(error) : resolve()));
  }
}

describe("Roadmap DAG — sugo_plan(prd) 자동 REQ 승격", () => {
  it("### 헤딩 PRD가 있으면 REQ 노드 + REQ-CONFIRM이 자동으로 심긴다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "team-a" });
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    const prdResult = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: HEADING_PRD });
    expect(prdResult.isError).toBe(false);

    const list = await call(handleSugoRoadmap, { action: "list", workspace: "team-a" });
    const ids = list.data.nodes.map((n: { id: string }) => n.id);
    expect(ids.some((id: string) => id.endsWith("::REQ-1"))).toBe(true);
    expect(ids.some((id: string) => id.endsWith("::REQ-2"))).toBe(true);
    expect(list.data.nodes.filter((n: { level: string }) => n.level === "spec")).toHaveLength(1);
    expect(list.data.nodes.filter((n: { level: string }) => n.level === "workstream")).toHaveLength(1);
    expect(ids.some((id: string) => id.endsWith("::REQ-CONFIRM"))).toBe(true);

    const req2 = list.data.nodes.find((n: { id: string }) => n.id.endsWith("::REQ-2"));
    expect(req2.dependsOn[0]).toMatch(/::REQ-1$/);
  });

  it("인라인 REQ만 있는 평범한 PRD는 로드맵에 아무것도 심지 않는다(no-op)", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "team-a" });
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, {
      action: "prd",
      sessionId,
      prdContent: "REQ-1: 인라인 형식이라 헤딩이 아니다. " + "가".repeat(90),
    });
    const list = await call(handleSugoRoadmap, { action: "list", workspace: "team-a" });
    // task 레벨 노드(featureName)는 backfillRoadmapTask로 항상 생기지만, REQ 자식은 없어야 한다.
    expect(list.data.nodes.filter((n: { level: string }) => n.level === "subtask")).toHaveLength(0);
  });
});

describe("sugo_roadmap ready/get/mark_req", () => {
  it("의존 관계상 REQ-1만 ready하고, REQ-2는 REQ-1이 done이어야 ready된다", async () => {
    const { taskId } = await toReadyAndBeyond(HEADING_PRD);
    const ready1 = await call(handleSugoRoadmap, { action: "ready", workspace: "team-a" });
    // 정확히 REQ-1만 ready여야 한다 — task 레벨 노드가 in_progress로 갱신되지 않으면
    // 의존성 없는 그 노드도 여기 잘못 섞여 나온다.
    expect(ready1.data.ready).toEqual([`${taskId}::REQ-1`]);

    await call(handleSugoRoadmap, { action: "mark_req", workspace: "team-a", id: `${taskId}::REQ-1` });
    const ready2 = await call(handleSugoRoadmap, { action: "ready", workspace: "team-a" });
    expect(ready2.data.ready).toContain(`${taskId}::REQ-2`);
  });

  it("에이전트가 REQ-CONFIRM을 mark_req로 직접 완료하려 하면 거부된다", async () => {
    await toReadyAndBeyond(HEADING_PRD);
    const list = await call(handleSugoRoadmap, { action: "list", workspace: "team-a" });
    const confirmId = list.data.nodes.find((n: { id: string }) => n.id.endsWith("::REQ-CONFIRM")).id;
    const result = await call(handleSugoRoadmap, { action: "mark_req", workspace: "team-a", id: confirmId });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("REQ_CONFIRM_AGENT_FORBIDDEN");
  });
});

describe("review_done → REQ/REQ-CONFIRM 자동완료", () => {
  it("review_done이 성공하면 해당 task의 모든 REQ와 REQ-CONFIRM이 done으로 롤다운된다", async () => {
    const { sessionId, taskId } = await toReadyAndBeyond(HEADING_PRD);
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    await approveDashboardReview(sessionId, taskId);

    const reviewDone = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(reviewDone.isError).toBe(false);

    const list = await call(handleSugoRoadmap, { action: "list", workspace: "team-a" });
    const req1 = list.data.nodes.find((n: { id: string }) => n.id.endsWith("::REQ-1"));
    const req2 = list.data.nodes.find((n: { id: string }) => n.id.endsWith("::REQ-2"));
    const confirm = list.data.nodes.find((n: { id: string }) => n.id.endsWith("::REQ-CONFIRM"));
    expect(req1.status).toBe("done");
    expect(req2.status).toBe("done");
    expect(confirm.status).toBe("done");
    expect(confirm.result.summary).toBe(GOOD_SUMMARY);
  });
});

describe("sugo_roadmap — link/unlink/group/backfill (task 레벨 관리)", () => {
  it("review 결과를 Dashboard 확인 카드로 게시하고 같은 세션을 잠근다", async () => {
    const { sessionId, taskId } = await toReadyAndBeyond(HEADING_PRD);
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });

    const reachableDashboard = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "in_progress", blocker: null, decision: null }));
    });
    await new Promise<void>((resolve) => reachableDashboard.listen(0, "127.0.0.1", resolve));
    try {
      const address = reachableDashboard.address();
      if (!address || typeof address === "string") throw new Error("test dashboard address unavailable");
      process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${address.port}`;
      process.env.SUGO_DASHBOARD_USER_ID = "tester";
      const skippedDashboardReview = await call(handleSugoPlan, {
        action: "review_done",
        sessionId,
        userConfirmed: true,
        summary: GOOD_SUMMARY,
        runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
      });
      expect(skippedDashboardReview.data.errorCode).toBe("REVIEW_CONFIRMATION_REQUIRED");
    } finally {
      delete process.env.SUGO_DASHBOARD_API_URL;
      delete process.env.SUGO_DASHBOARD_USER_ID;
      await new Promise<void>((resolve, reject) => reachableDashboard.close((error) => error ? reject(error) : resolve()));
    }

    const requested = await call(handleSugoRoadmap, {
      action: "request_review_confirmation",
      workspace: "team-a",
      id: taskId,
      sessionId,
      reviewPacket: {
        summary: "로그인 구현과 검증을 마쳤습니다.",
        changes: ["이메일 로그인 추가"],
        tests: ["npm test 통과"],
        designDecisions: ["기존 인증 흐름 재사용"],
        knownLimitations: [],
      },
    });

    expect(requested.isError).toBe(false);
    expect(requested.data).toMatchObject({ awaitingHumanDecision: true, presentation: "dashboard" });
    expect(requested.data.node.humanBlocker).toMatchObject({
      kind: "review_confirmation",
      sessionId,
      resumeAction: "review_done",
      reviewPacket: { tests: ["npm test 통과"], report: { schemaVersion: 1, kind: "feat", verification: { test: { state: expect.any(String) } } } },
    });
    const blocked = await call(handleSugoPlan, { action: "review_done", sessionId, userConfirmed: true });
    expect(blocked.data.errorCode).toBe("HUMAN_DECISION_REQUIRED");
  });

  it("사람만 답할 수 있는 판단은 구조화된 차단으로 기록한다", async () => {
    const { sessionId, taskId } = await toReadyAndBeyond(HEADING_PRD);
    const blocked = await call(handleSugoRoadmap, {
      action: "block_for_human", workspace: "team-a", id: taskId, sessionId,
      stage: "CODE_RUNNING", resumeAction: "code_done", blockerSummary: "승인 정책 구현 중",
      question: "승인자는 누구입니까?", context: ["SPEC에 역할이 없습니다."],
      options: [{ id: "lead", label: "팀장", impact: "통제가 강화됩니다." }], blockedNextStep: "권한 검사 구현",
    });
    expect(blocked.isError).toBe(false);
    expect(blocked.data.node).toMatchObject({ status: "blocked", humanBlocker: { sessionId, resumeAction: "code_done" } });

    const forbidden = await call(handleSugoPlan, { action: "code_start", sessionId });
    expect(forbidden.isError).toBe(true);
    expect(forbidden.data.errorCode).toBe("HUMAN_DECISION_REQUIRED");

    const blockedSession = await loadSession(sessionId);
    expect(validateOperationalContract(blockedSession)).toEqual({ valid: true, violations: [] });
    expect(explainSessionBlock(blockedSession)).toMatchObject({
      blocked: true, reason: "승인 정책 구현 중", resumesAt: "code_done", unresolvedImpact: "권한 검사 구현"
    });

    const status = await call(handleSugoPlan, { action: "status", sessionId });
    expect(status.isError).toBe(false);

    // mock 함수가 아니라 실제 HTTP seam으로 Dashboard 결정 응답을 받아 복구까지 검증한다.
    const dashboard = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        status: "blocked",
        blocker: { sessionId, resumeAction: "code_done" },
        decision: { response: "승인자는 팀장입니다.", answered_by: "tester", answered_at: "2026-10-01T00:00:00.000Z" }
      }));
    });
    await new Promise<void>((resolve) => dashboard.listen(0, "127.0.0.1", resolve));
    try {
      const address = dashboard.address();
      if (!address || typeof address === "string") throw new Error("test dashboard address unavailable");
      process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${address.port}`;
      process.env.SUGO_DASHBOARD_USER_ID = "tester";
      const resumed = await call(handleSugoRoadmap, { action: "resume_with_decision", workspace: "team-a", id: taskId, sessionId });
      expect(resumed.isError).toBe(false);
      expect(resumed.data).toMatchObject({ resumeAction: "code_done", node: { status: "in_progress" } });
      const resumedSession = await loadSession(sessionId);
      expect(resumedSession.data.humanDecisionGate).toBeUndefined();
      expect(validateOperationalContract(resumedSession)).toEqual({ valid: true, violations: [] });
      expect(explainSessionBlock(resumedSession).blocked).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => dashboard.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("link는 task 레벨끼리만 허용하고 사이클을 거부한다", async () => {
    await call(handleSugoRoadmap, { action: "add", workspace: "team-b", id: "A", title: "A", level: "task" });
    await call(handleSugoRoadmap, { action: "add", workspace: "team-b", id: "B", title: "B", level: "task" });
    const link = await call(handleSugoRoadmap, { action: "link", workspace: "team-b", fromId: "B", toId: "A" });
    expect(link.isError).toBe(false);

    const cyclic = await call(handleSugoRoadmap, { action: "link", workspace: "team-b", fromId: "A", toId: "B" });
    expect(cyclic.isError).toBe(true);
    expect(cyclic.data.errorCode).toBe("CYCLE");

    await call(handleSugoRoadmap, { action: "unlink", workspace: "team-b", fromId: "B", toId: "A" });
    const b = await call(handleSugoRoadmap, { action: "get", workspace: "team-b", id: "B" });
    expect(b.data.node.dependsOn).not.toContain("A");
  });

  it("group으로 workstream을 만들고 task들을 묶는다", async () => {
    await call(handleSugoRoadmap, { action: "add", workspace: "team-b", id: "A", title: "A", level: "task" });
    await call(handleSugoRoadmap, {
      action: "group",
      workspace: "team-b",
      id: "WS-1",
      title: "인증 워크스트림",
      taskIds: ["A"],
    });
    const a = await call(handleSugoRoadmap, { action: "get", workspace: "team-b", id: "A" });
    expect(a.data.node.parent).toBe("WS-1");
  });

  it("backfill로 기존 태스크를 소급 승격한다", async () => {
    const backfill = await call(handleSugoRoadmap, {
      action: "backfill",
      workspace: "team-b",
      id: "legacy-task",
      title: "레거시 작업",
    });
    expect(backfill.isError).toBe(false);
    expect(backfill.data.node.level).toBe("task");
  });

  it("remove로 노드를 지우면 다른 노드의 dependsOn 참조도 제거된다", async () => {
    await call(handleSugoRoadmap, { action: "add", workspace: "team-b", id: "X", title: "X", level: "task" });
    await call(handleSugoRoadmap, { action: "add", workspace: "team-b", id: "Y", title: "Y", level: "task", dependsOn: ["X"] });
    await call(handleSugoRoadmap, { action: "remove", workspace: "team-b", id: "X" });
    const y = await call(handleSugoRoadmap, { action: "get", workspace: "team-b", id: "Y" });
    expect(y.data.node.dependsOn).not.toContain("X");
  });
});
