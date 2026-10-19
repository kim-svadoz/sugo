import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

let fakeHome: string;
let projectDir: string;
let server: Server;
let port: number;
const received: string[] = [];

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-dsync-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-dsync-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
  received.length = 0;
  server = createServer((req, res) => {
    received.push(req.url ?? "");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200);
      res.end();
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

describe("대시보드 sync — 실제 파이프라인 배선 e2e", () => {
  it("sugo_add(workspace)가 /api/sync/workspace를 논블로킹으로 쏜다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "ws-sync" });
    await waitFor(() => received.includes("/api/sync/workspace"));
    expect(received).toContain("/api/sync/workspace");
  });

  it("prd(헤딩 REQ)가 task+roadmap 스냅샷을 논블로킹으로 쏜다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "ws-sync" });
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "### REQ-1: 로그인\n" + "가".repeat(90) });

    await waitFor(() => received.includes("/api/sync/task") && received.includes("/api/sync/roadmap"));
    expect(received).toContain("/api/sync/task");
    expect(received).toContain("/api/sync/roadmap");
  });

  it("대시보드가 disabled(env 없음)면 아무 요청도 안 나간다", async () => {
    delete process.env.SUGO_DASHBOARD_API_URL;
    delete process.env.SUGO_DASHBOARD_USER_ID;
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "ws-nosync" });
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(0);
  });
});
