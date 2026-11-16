import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRoadmap } from "../src/tools/sugoRoadmap.js";
import { arrivedDecisions, pendingDecisions, promptContext, unseenDecisions, waitForDecisionOnStop, type PendingDecision } from "../src/lifecycle/decisionHook.js";
import type { RemoteBlockerDecision } from "../src/dashboard/fetch.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let home: string;
let project: string;
let dashboard: Server | null = null;
let decision: RemoteBlockerDecision["decision"] = null;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "sugo-decision-hook-home-"));
  project = mkdtempSync(join(tmpdir(), "sugo-decision-hook-project-"));
  writeFileSync(join(project, "package.json"), "{}\n");
  process.env.SUGO_HOME_OVERRIDE = home;
  decision = null;
});

afterEach(async () => {
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.SUGO_DASHBOARD_API_URL;
  delete process.env.SUGO_DASHBOARD_USER_ID;
  if (dashboard) await new Promise<void>((resolve) => dashboard!.close(() => resolve()));
  dashboard = null;
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

async function blockedSession(): Promise<{ sessionId: string; taskId: string }> {
  await call(handleSugoAdd, { projectPath: project, workspace: "team-a", integrationGateEnforced: false });
  const start = await call(handleSugoPlan, { action: "start", projectPath: project, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "### REQ-1: 이메일 로그인\n" + "가".repeat(90) });
  const roadmap = await call(handleSugoRoadmap, { action: "list", workspace: "team-a" });
  const taskId = roadmap.data.nodes.find((node: { level: string }) => node.level === "task").id as string;
  const blocked = await call(handleSugoRoadmap, {
    action: "block_for_human", workspace: "team-a", id: taskId, sessionId, stage: "READY", resumeAction: "baseline_capture",
    blockerSummary: "정책 미정", question: "승인자는 누구입니까?", context: [], options: [], blockedNextStep: "구현",
  });
  expect(blocked.isError).toBe(false);
  dashboard = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "blocked", blocker: { sessionId }, decision }));
  });
  await new Promise<void>((resolve) => dashboard!.listen(0, "127.0.0.1", resolve));
  const address = dashboard.address();
  if (!address || typeof address === "string") throw new Error("dashboard address unavailable");
  process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUGO_DASHBOARD_USER_ID = "tester";
  return { sessionId, taskId };
}

describe("결정 대기 정지 훅", () => {
  it("이 대화가 만든 대기가 없으면 기다리지 않고 정지를 허용한다", async () => {
    await blockedSession();
    const startedAt = Date.now();
    expect(await waitForDecisionOnStop({ transcript: "다른 작업 대화", waitMs: 5_000, pollMs: 10 })).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("결정이 늦게 와도 기다렸다가 정지를 막고 재개를 지시한다", async () => {
    const { sessionId, taskId } = await blockedSession();
    setTimeout(() => { decision = { response: "승인자는 팀장입니다.", answered_by: "tester", answered_at: "2026-11-16T05:00:00.000Z" }; }, 60);
    const result = await waitForDecisionOnStop({ transcript: `{"sessionId":"${sessionId}"}`, waitMs: 5_000, pollMs: 10 });
    expect(result?.decision).toBe("block");
    expect(result?.reason).toContain(`sugo_roadmap(action:"resume_with_decision", workspace:"team-a", id:"${taskId}", sessionId:"${sessionId}")`);
    expect(result?.reason).toContain("승인자는 팀장입니다.");
  });

  it("상한 시간 안에 결정이 없으면 정지를 허용한다", async () => {
    const { sessionId } = await blockedSession();
    expect(await waitForDecisionOnStop({ transcript: sessionId, waitMs: 50, pollMs: 10 })).toBeNull();
  });

  it("결정을 반영해 대기가 풀린 세션은 다시 기다리지 않는다", async () => {
    const { sessionId, taskId } = await blockedSession();
    decision = { response: "승인자는 팀장입니다.", answered_by: "tester", answered_at: "2026-11-16T05:00:00.000Z" };
    const resumed = await call(handleSugoRoadmap, { action: "resume_with_decision", workspace: "team-a", id: taskId, sessionId });
    expect(resumed.isError).toBe(false);
    expect(await pendingDecisions()).toEqual([]);
    expect(await waitForDecisionOnStop({ transcript: sessionId, waitMs: 50, pollMs: 10 })).toBeNull();
  });
});

describe("배포 번들 훅", () => {
  const hook = join(__dirname, "..", "dist", "decision-hook.mjs");
  const runHook = (mode: string, input: unknown) => new Promise<{ code: number | null; stdout: string }>((resolve) => {
    const child = spawn(process.execPath, [hook, mode], { env: { ...process.env, SUGO_DECISION_WAIT_MS: "3000", SUGO_DECISION_POLL_MS: "20" } });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("exit", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify(input));
  });

  it("정지 훅은 대화 기록의 대기에 결정이 오면 정지를 막는 JSON을 내고, 입력 훅은 재개 안내를 한 번만 낸다", async () => {
    const { sessionId } = await blockedSession();
    const transcript = join(home, "transcript.jsonl");
    writeFileSync(transcript, `{"type":"tool_use","input":{"sessionId":"${sessionId}"}}\n`);
    setTimeout(() => { decision = { response: "승인자는 팀장입니다.", answered_by: "tester", answered_at: "2026-11-16T05:00:00.000Z" }; }, 300);

    const stopped = await runHook("stop", { session_id: "claude-a", transcript_path: transcript });
    expect(stopped.code).toBe(0);
    expect(JSON.parse(stopped.stdout)).toMatchObject({ decision: "block", reason: expect.stringContaining(`sessionId:"${sessionId}"`) });

    const first = await runHook("prompt", { session_id: "claude-b" });
    expect(first.stdout).toContain("resume_with_decision");
    expect((await runHook("prompt", { session_id: "claude-b" })).stdout).toBe("");
  });
});

describe("결정 도착 알림", () => {
  const pending: PendingDecision = { sessionId: "plan-1", featureName: "login", workspace: "team-a", taskId: "task-1" };
  const answer = (response: string, sessionId = "plan-1"): Promise<RemoteBlockerDecision> => Promise.resolve({
    status: "blocked", blocker: { sessionId }, decision: { response, answered_by: "tester", answered_at: "2026-11-16T05:00:00.000Z" },
  });

  it("결정이 없거나 다른 세션이 만든 차단의 결정은 도착으로 보지 않는다", async () => {
    expect(await arrivedDecisions([pending], () => Promise.resolve({ status: "blocked", blocker: { sessionId: "plan-1" }, decision: null }))).toEqual([]);
    expect(await arrivedDecisions([pending], () => answer("진행", "plan-2"))).toEqual([]);
    expect(await arrivedDecisions([pending], () => Promise.reject(new Error("dashboard down")))).toEqual([]);
    expect(await arrivedDecisions([pending], () => answer("진행"))).toEqual([{ ...pending, response: "진행", answeredAt: "2026-11-16T05:00:00.000Z" }]);
  });

  it("같은 Claude 세션에는 같은 결정을 한 번만 알리고, 다른 Claude 세션에는 다시 알린다", async () => {
    const noticePath = join(home, "notices.json");
    const arrived = await arrivedDecisions([pending], () => answer("확인, 진행"));
    expect(await unseenDecisions("claude-a", arrived, noticePath)).toHaveLength(1);
    expect(await unseenDecisions("claude-a", arrived, noticePath)).toEqual([]);
    expect(await unseenDecisions("claude-b", arrived, noticePath)).toHaveLength(1);
    expect(promptContext(arrived)).toContain('sessionId:"plan-1"');
  });
});
