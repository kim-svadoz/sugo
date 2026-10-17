import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { expect, it } from "vitest";
import { addRoadmapNode, recordRoadmapWorkResult, pullRoadmapOrdering, getRoadmapNode } from "../src/work/roadmap.js";
import { buildWorkResultReport } from "../src/workResultReport.js";
import { labelId } from "../src/labelGuard.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRoadmap } from "../src/tools/sugoRoadmap.js";
import { saveSession } from "../src/session.js";
import type { PlanSession } from "../src/types.js";

it("pull applies dashboard-owned approval/revoke to work-result and rejects a different result", async () => {
  const home = await mkdtemp(join(tmpdir(), "sugo-approval-pull-"));
  const old = { home: process.env.SUGO_HOME_OVERRIDE, url: process.env.SUGO_DASHBOARD_API_URL, user: process.env.SUGO_DASHBOARD_USER_ID };
  process.env.SUGO_HOME_OVERRIDE = home;
  const label = { kind: "evidenceResnapshot" as const, reason: "원래 제외 사유", patchVersion: 0, recordedAt: "2026-10-02" };
  const report = buildWorkResultReport({ featureName: "f", kind: "feat", patchVersion: 0, completedAt: "2026-10-02", completionGrade: "unverified", bypassLabels: [label], summary: "요약", changedFiles: [], testEvidence: { state: "pass" }, runtimeVerified: true });
  const path = join(home, "work-result.md");
  const approval = { labelId: labelId(label), kind: label.kind, originalReason: label.reason, reason: "코드와 무관", action: "approve" as const, userId: "human", at: "2026-10-06", workResultPath: path };
  let remote = { path, report: { ...report, humanApprovals: [approval], completionGrade: "verified_by_human" as string } };
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ nodes: [{ id: "task", depends_on: [], work_result: remote }] })); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.SUGO_DASHBOARD_USER_ID = "human";
  try {
    await addRoadmapNode("ws", { id: "task", title: "f", level: "task", status: "done", dependsOn: [] });
    await recordRoadmapWorkResult("ws", "task", { path, report }, { version: 0, completedAt: report.completedAt });
    expect(await pullRoadmapOrdering("ws")).toBe(true);
    expect((await getRoadmapNode("ws", "task"))?.workResult?.report?.completionGrade).toBe("verified_by_human");
    let content = await readFile(path, "utf8");
    expect(content).toContain("사람 승인 검증완료");
    expect(content).toContain("원래 제외 사유");
    expect(content).toContain("코드와 무관");
    remote.report = { ...remote.report, humanApprovals: [...remote.report.humanApprovals, { ...approval, action: "revoke" } as any], completionGrade: "unverified" };
    await pullRoadmapOrdering("ws");
    content = await readFile(path, "utf8");
    expect(content).toContain("승인 취소");
    expect(content).toContain("FEAT · 미검증");
    remote.report.completedAt = "2026-10-07";
    remote.report.completionGrade = "verified_by_human";
    await pullRoadmapOrdering("ws");
    expect((await getRoadmapNode("ws", "task"))?.workResult?.report?.completionGrade).toBe("unverified");
    // Legacy reports without labels must never become verified merely because [] is inferred.
    const legacy = { ...report, bypassLabels: undefined };
    await recordRoadmapWorkResult("ws", "task", { path, report: legacy }, { version: 0, completedAt: report.completedAt });
    remote = { path, report: { ...legacy, humanApprovals: [], completionGrade: "unverified" } };
    await pullRoadmapOrdering("ws");
    expect((await getRoadmapNode("ws", "task"))?.workResult?.report?.completionGrade).toBe("unverified");
    await saveSession({ id: "plan-legacy", state: "DONE", projectPath: home, featureName: "f", startedAt: "2026-10-02", updatedAt: "2026-10-02",
      data: { mode: "plan", linkedWorkspace: "ws", linkedTaskId: "task", chainInfo: { changedFiles: [], analyzeAttempts: 0, analyzePassed: null,
        testPassedState: "pass", reviewPassed: true, autoLoopRetryCount: 0, workResultPath: path, workResultReport: legacy, bypassLabels: [label] } } } as PlanSession);
    expect((await getRoadmapNode("ws", "task"))?.workResult?.report?.bypassLabels).toEqual([label]);
    remote = { path, report: { ...report, humanApprovals: [approval], completionGrade: "verified_by_human" } };
    await pullRoadmapOrdering("ws");
    expect((await getRoadmapNode("ws", "task"))?.workResult?.report?.completionGrade).toBe("verified_by_human");
    await expect(handleSugoPlan({ action: "approve", sessionId: "fake" })).rejects.toThrow();
    await expect(handleSugoRoadmap({ action: "approve", workspace: "ws" })).rejects.toThrow();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [key, value] of Object.entries({ SUGO_HOME_OVERRIDE: old.home, SUGO_DASHBOARD_API_URL: old.url, SUGO_DASHBOARD_USER_ID: old.user })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(home, { recursive: true, force: true });
  }
});
