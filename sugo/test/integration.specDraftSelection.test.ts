import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRoadmap } from "../src/tools/sugoRoadmap.js";
import { syncRemoteCheckpointsToRules } from "../src/work/checkpoint.js";

async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const PRD = "### REQ-1: 미연동 초안 구현\n" + "가".repeat(100);

describe("feat 미연결 SPEC 초안 선택 게이트", () => {
  let server: Server;
  let projectDir: string;
  let fakeHome: string;

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "sugo-spec-draft-project-"));
    writeFileSync(join(projectDir, "package.json"), "{}\n");
    fakeHome = mkdtempSync(join(tmpdir(), "sugo-spec-draft-home-"));
    process.env.SUGO_HOME_OVERRIDE = fakeHome;
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url?.startsWith("/api/workspaces/checkpoint-sync")) {
        res.end(JSON.stringify({ checkpoints: [{ id: "CP-expired", title: "만료 규칙", category: "general", checklist: ["확인"], expires_at: "2000-01-01" }] }));
      } else {
        res.end(JSON.stringify({
          nodes: [{ id: "spec-manual-test", title: "미연동스펙-테스트용", level: "spec", status: "pending", due_date: "2026-10-10", parent: null }],
        }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.SUGO_DASHBOARD_USER_ID = "u1";
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "tmp-workspace" });
  });

  afterEach(async () => {
    delete process.env.SUGO_HOME_OVERRIDE;
    delete process.env.SUGO_DASHBOARD_API_URL;
    delete process.env.SUGO_DASHBOARD_USER_ID;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("start가 후보를 보여주고 사용자 결정 없이는 clarify를 차단한다", async () => {
    await syncRemoteCheckpointsToRules(projectDir, "tmp-workspace", [{ id: "CP-expired", title: "만료 규칙", category: "general", checklist: ["확인"] }], { projectName: "", harnessIds: [] });
    const expiredFile = join(projectDir, ".claude", "rules", "general", "CP-expired-만료-규칙.md");
    expect(existsSync(expiredFile)).toBe(true);
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "checkout" });
    expect(existsSync(expiredFile)).toBe(false);
    expect(start.data.unlinkedSpecDrafts).toEqual([
      { id: "spec-manual-test", title: "미연동스펙-테스트용", dueDate: "2026-10-10", projectPath: null, workBranch: null, specPath: null },
    ]);
    const blocked = await call(handleSugoPlan, { action: "clarify", sessionId: start.data.sessionId });
    expect(blocked.isError).toBe(true);
    expect(blocked.data.errorCode).toBe("SPEC_DRAFT_SELECTION_REQUIRED");
  });

  it("Dashboard feat 명령은 start부터 선택과 원본 SPEC을 고정한다", async () => {
    const specPath = join(projectDir, "dashboard-spec.md");
    writeFileSync(specPath, "# dashboard spec\n");
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url?.startsWith("/api/workspaces/checkpoint-sync")) return res.end(JSON.stringify({ checkpoints: [] }));
      res.end(JSON.stringify({ nodes: [{
        id: "spec-manual-test", title: "미연동스펙-테스트용", level: "spec", status: "pending",
        due_date: "2026-10-10", parent: null, project_path: projectDir, spec_path: specPath,
      }] }));
    });
    const start = await call(handleSugoPlan, {
      action: "start", projectPath: projectDir, featureName: "checkout", specDraftId: "spec-manual-test", specPath,
    });
    expect(start.isError).toBe(false);
    expect(start.data.unlinkedSpecDrafts).toEqual([expect.objectContaining({ id: "spec-manual-test", specPath })]);
    const clarify = await call(handleSugoPlan, { action: "clarify", sessionId: start.data.sessionId });
    expect(clarify.isError).toBe(false);
  });

  it("선택한 초안 아래에 Run과 Task를 만들고 새 Spec은 만들지 않는다", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "checkout" });
    const clarify = await call(handleSugoPlan, {
      action: "clarify",
      sessionId: start.data.sessionId,
      specDraftDecision: "link",
      specDraftId: "spec-manual-test",
    });
    expect(clarify.isError).toBe(false);
    const prd = await call(handleSugoPlan, { action: "prd", sessionId: start.data.sessionId, prdContent: PRD });
    expect(prd.isError).toBe(false);

    const roadmap = await call(handleSugoRoadmap, { action: "list", workspace: "tmp-workspace" });
    const specs = roadmap.data.nodes.filter((node: { level: string }) => node.level === "spec");
    expect(specs).toEqual([expect.objectContaining({ id: "spec-manual-test", title: "미연동스펙-테스트용" })]);
    const run = roadmap.data.nodes.find((node: { level: string }) => node.level === "workstream");
    expect(run.parent).toBe("spec-manual-test");
  });
});
