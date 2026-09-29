import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoCheckpoint } from "../src/tools/sugoCheckpoint.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoValidate } from "../src/tools/sugoValidate.js";
import { handleSugoRoadmap } from "../src/tools/sugoRoadmap.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";

const execFileAsync = promisify(execFile);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args?: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;
let projectDir: string;
let server: Server;
let port: number;
const received: { path: string; method?: string; body: unknown }[] = [];

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-dremainder-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-dremainder-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
  received.length = 0;
  server = createServer((req, res) => {
    const url = req.url ?? "";
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ path: url, method: req.method, body: body ? JSON.parse(body) : undefined });
      res.writeHead(200, { "Content-Type": "application/json" });
      if (url.startsWith("/api/workspaces/checkpoint-sync")) {
        // 대시보드 실제 형태: {checkpoints:[...]}, applies_to(snake)
        res.end(JSON.stringify({ checkpoints: [{ id: "CP-remote", title: "원격 규칙", category: "backend", checklist: ["체크1"], applies_to: null }] }));
      } else if (url.startsWith("/api/workspaces/") && url.includes("/roadmap")) {
        // 대시보드 실제 형태: {nodes:[...]}, depends_on(snake)
        res.end(JSON.stringify({ nodes: [{ id: "A", depends_on: ["B"], manual_status: "in_review", title: "A", level: "task", status: "pending" }] }));
      } else if (url === "/api/metrics/calibrated-ratio") {
        res.end(JSON.stringify({ ratio: 1.5 }));
      } else {
        res.end("{}");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
  process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${port}`;
  process.env.SUGO_DASHBOARD_USER_ID = "u1";
});

afterEach(async () => {
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.SUGO_DASHBOARD_API_URL;
  delete process.env.SUGO_DASHBOARD_USER_ID;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("sugo_roadmap(pull_ordering)", () => {
  it("원격 dependsOn/manual_status를 로컬 노드에 병합한다", async () => {
    await call(handleSugoRoadmap, { action: "add", workspace: "ws1", id: "A", title: "A", level: "task" });
    const pull = await call(handleSugoRoadmap, { action: "pull_ordering", workspace: "ws1" });
    expect(pull.data.pulled).toBe(true);
    const node = await call(handleSugoRoadmap, { action: "get", workspace: "ws1", id: "A" });
    expect(node.data.node.dependsOn).toEqual(["B"]);
    expect(node.data.node.manual_status).toBe("in_review");
  });
});

describe("sugo_checkpoint(pull)", () => {
  it("원격 체크포인트를 .claude/rules/<category>/에 기록한다", async () => {
    const pull = await call(handleSugoCheckpoint, { action: "pull", workspace: "ws1", projectPath: projectDir });
    expect(pull.isError).toBe(false);
    expect(pull.data.pulledCount).toBe(1);
    const content = readFileSync(join(projectDir, ".claude", "rules", "backend", "CP-remote-원격-규칙.md"), "utf-8");
    expect(content).toContain("체크1");
    expect(received.some((r) => r.path.includes("workspace=ws1"))).toBe(true);
  });
});

describe("commit → prRefs 수집 + WorkLog에 실림", () => {
  it("git 원격이 있는 프로젝트는 commit 시 prRefs를 WorkLog에 담아 대시보드로 보낸다", async () => {
    await execFileAsync("git", ["init", "-b", "main"], { cwd: projectDir });
    await execFileAsync("git", ["config", "user.email", "t@example.com"], { cwd: projectDir });
    await execFileAsync("git", ["config", "user.name", "T"], { cwd: projectDir });
    await execFileAsync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: projectDir });
    await execFileAsync("git", ["remote", "add", "origin", "https://bitbucket.example.com/scm/proj/repo.git"], { cwd: projectDir });

    await call(handleSugoAdd, { projectPath: projectDir, workspace: "ws-pr" });
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "REQ-1: 로그인. " + "가".repeat(90) });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    const reviewDone = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: "배경: 로그인이 없었다.\n변경: 로그인을 추가했다.\n설계: 단순 구현.\n테스트: 통과 확인.",
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    // calibrated-ratio(1.5)가 실제로 쓰였는지 확인 — humanHours 기본 3.5가 아니라 1.5 기준이어야 한다.
    expect(reviewDone.data.humanHoursEstimate.estimationBasis).toContain("보정비율 1.5");

    await call(handleSugoPlan, { action: "docs_done", sessionId });
    received.length = 0;
    const commit = await call(handleSugoPlan, { action: "commit", sessionId });
    expect(commit.isError).toBe(false);

    // commit이 WorkLog를 대시보드로 sync한다(평평한 history wire). prRefs는 §7.2 정본 경로가
    // roadmap 노드 workResult.prRefs라 history wire엔 실리지 않는다(seam 어댑터가 제외) — 대신
    // prRefs가 로컬 WorkLog에는 수집돼 있어야 한다(git 원격에서 repoSlug 추출).
    const historyPush = received.find((r) => r.path === "/api/sync/history");
    expect(historyPush).toBeDefined();
    const body = historyPush!.body as { id: string; taskTitle: string; prRefs?: unknown };
    expect(body.taskTitle).toBe("login");
    expect(body.prRefs).toBeUndefined();

    // prRefs가 실제로 수집됐는지는 로컬 WorkLog(history 파일)로 확인한다.
    const historyDir = join(fakeHome, ".claude", "sugo", "work", "ws-pr", "history");
    const logFile = readdirSync(historyDir).find((f) => f.endsWith(".json"));
    expect(logFile).toBeDefined();
    const workLog = JSON.parse(readFileSync(join(historyDir, logFile!), "utf-8")) as { prRefs?: { repoSlug: string } };
    expect(workLog.prRefs?.repoSlug).toBe("repo");
  });
});
