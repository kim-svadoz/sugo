import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { issueSession } from "../src/auth/session.js";
import { seedUserToken } from "./testAuth.js";
import { completionLabelId } from "../src/services/humanCompletion.js";

async function fixture() {
  const db = createSqliteClient();
  await db.execScript(readFileSync(new URL("./schema.sqlite.sql", import.meta.url), "utf8"));
  const pat = await seedUserToken(db);
  const secret = "human-completion-test-secret";
  const session = `Bearer ${await issueSession("u1", secret)}`;
  const local = `Bearer ${await issueSession("u1", secret, 3600, "local")}`;
  const { app } = await createApp({ db, sessionSecret: secret });
  const labels = ["evidenceResnapshot", "runtimeUnverified"].map((kind, i) => ({ kind, reason: `원래 사유 ${i}`, patchVersion: 0, recordedAt: `2026-10-02T00:00:0${i}Z` }));
  const workResult = { path: "/work-result.md", report: { schemaVersion: 1, patchVersion: 0, completedAt: "2026-10-02", completionGrade: "unverified", bypassLabels: labels } };
  const payload = { workspaceName: "ws", nodes: [{ id: "task", title: "task", level: "task", status: "done", workResult }] };
  const sync = async (data = payload) => request(app).post("/api/sync/roadmap").set("Authorization", pat).send(data).expect(200);
  await sync();
  const get = async () => (await request(app).get("/api/workspaces/ws/roadmap").set("Authorization", pat).expect(200)).body.nodes[0].work_result;
  const url = "/api/workspaces/ws/roadmap/completion-approval";
  const key = (await get()).approvalResultKey;
  const approve = (i: number, action = "approve", reason = "로컬 환경 의존 테스트 제외, 코드와 무관", auth = session) => request(app).post(url).set("Authorization", auth).send({ nodeId: "task", resultKey: key, labelId: completionLabelId(labels[i]), action, reason });
  return { db, app, pat, session, local, labels, payload, sync, get, approve, url, key };
}
describe("dashboard-owned human completion audit", () => {
  it("partial/full approval, resync preservation, revoke and audit originals", async () => {
    const f = await fixture();
    try {
      const view = async () => (await request(f.app).get("/api/workspaces/ws/roadmap").set("Authorization", f.pat).expect(200)).body;
      expect((await view()).nodes[0].display_status).toBe("verification");
      expect((await view()).counts.done).toBe(0);
      expect((await view()).counts.verification).toBe(1);
      await f.approve(0).expect(200);
      expect((await f.get()).report.completionGrade).toBe("unverified");
      await f.approve(1).expect(200);
      expect((await f.get()).report.completionGrade).toBe("verified_by_human");
      expect((await view()).nodes[0].display_status).toBe("done");
      expect((await view()).counts.done).toBe(1);
      await f.sync();
      expect((await f.get()).report.completionGrade).toBe("verified_by_human");
      await f.approve(0, "revoke", "승인 판단 재검토").expect(200);
      expect((await view()).nodes[0].display_status).toBe("verification");
      const result = await f.get();
      expect(result.report.completionGrade).toBe("unverified");
      expect(result.report.bypassLabels).toEqual(f.labels);
      expect(result.report.humanApprovals).toHaveLength(3);
      expect(result.report.humanApprovals[0]).toMatchObject({ userId: "u1", originalReason: f.labels[0].reason, workResultPath: "/work-result.md" });
      // Deleting a node preserves its audit history.
      await request(f.app).post("/api/sync/roadmap").set("Authorization", f.pat).send({ workspaceName: "ws", nodes: [] }).expect(200);
      const history = await request(f.app).get("/api/workspaces/ws/roadmap/completion-approval-history?nodeId=task").set("Authorization", f.pat).expect(200);
      expect(history.body.events).toHaveLength(3);
    } finally { await f.db.close(); }
  });
  it("rejects blank reasons, API/MCP credentials,  spoofed user and stale result", async () => {
    const f = await fixture();
    try {
      await f.approve(0, "approve", " ").expect(400);
      await f.approve(0, "approve", "reviewed", f.pat).expect(403);
      await f.approve(0, "approve", "reviewed", f.local).expect(200);
      expect((await f.get()).report.humanApprovals[0].userId).toBe("u1");
      const other = `Bearer ${await issueSession("u2", "human-completion-test-secret")}`;
      await f.approve(0, "approve", "reviewed", other).expect(409);
      await request(f.app).post(f.url).set("Authorization", f.session).send({ nodeId: "task", resultKey: f.key, labelId: completionLabelId(f.labels[0]), action: "approve", reason: "reviewed", userId: "fake" }).expect(400);
      const newer = structuredClone(f.payload);
      newer.nodes[0].workResult.report.completedAt = "2026-10-06";
      await f.sync(newer);
      await f.approve(0).expect(409);
      expect((await f.get()).report.completionGrade).toBe("unverified");
    } finally { await f.db.close(); }
  });
  it("sync cannot mint approvals or verified_by_human, including lineage", async () => {
    const f = await fixture();
    try {
      const forged: any = structuredClone(f.payload);
      forged.nodes[0].workResult.report.completionGrade = "verified_by_human";
      forged.nodes[0].workResult.report.humanApprovals = f.labels.map(l => ({ labelId: completionLabelId(l), action: "approve", userId: "fake", reason: "fake" }));
      forged.nodes[0].lineage = [{ workResult: forged.nodes[0].workResult }];
      await f.sync(forged);
      const result = await f.get();
      expect(result.report.completionGrade).toBe("unverified");
      expect(result.report.humanApprovals).toEqual([]);
      const [{ lineage }] = await f.db.query<{ lineage: string }>("SELECT lineage FROM sugo_roadmap_nodes");
      expect(lineage).not.toContain("humanApprovals");
      expect(lineage).not.toContain("verified_by_human");
    } finally { await f.db.close(); }
  });
  it("projects each lineage result with its own verification reason and approval identity", async () => {
    const f = await fixture();
    try {
      const payload: any = structuredClone(f.payload);
      const patchLabel = { kind: "runtimeUnverified", reason: "patch v1의 별도 검증 사유", patchVersion: 1, recordedAt: "2026-10-08T00:00:00Z" };
      const patchResult = { path: "/work-result-v1.md", parentTaskId: "task", report: { patchVersion: 1, completedAt: "2026-10-08", completionGrade: "unverified", bypassLabels: [patchLabel] } };
      payload.nodes[0].workResult = patchResult;
      payload.nodes[0].lineage = [
        { version: 0, workResult: f.payload.nodes[0].workResult },
        { version: 1, workResult: patchResult },
      ];
      await f.sync(payload);
      const node = (await request(f.app).get("/api/workspaces/ws/roadmap").set("Authorization", f.pat).expect(200)).body.nodes[0];
      expect(node.lineage.map((entry: any) => entry.workResult.report.bypassLabels[0].reason)).toEqual(["원래 사유 0", patchLabel.reason]);
      expect(node.lineage[0].workResult.approvalResultKey).toBeTypeOf("string");
      expect(node.lineage[1].workResult.approvalResultKey).toBe(node.work_result.approvalResultKey);
    } finally { await f.db.close(); }
  });
});

it("미검증 Task와 상위 컨테이너를 검증 상태로 표시하고 완료율에서 제외한다", async () => {
  const f = await fixture();
  try {
    await request(f.app).post("/api/sync/workspace").set("Authorization", f.pat).send({ name: "ws", projects: [] }).expect(200);
    await f.sync({ workspaceName: "ws", nodes: [
      { id: "spec", title: "spec", level: "spec", status: "done" },
      { id: "run", title: "run", level: "workstream", status: "done", parent: "spec" },
      { ...f.payload.nodes[0], parent: "run" },
    ] } as any);
    const view = async () => (await request(f.app).get("/api/workspaces/ws/roadmap").set("Authorization", f.pat).expect(200)).body;
    expect((await view()).nodes.map((n: any) => n.display_status)).toEqual(["verification", "verification", "verification"]);
    expect((await view()).counts).toMatchObject({ done: 0, verification: 1 });
    const schedule = async () => (await request(f.app).get("/api/workspaces/schedule").set("Authorization", f.pat).expect(200)).body.specs[0];
    expect(await schedule()).toMatchObject({ status: "verification", done_task_count: 0, unverified_task_count: 1 });
    const workspaces = await request(f.app).get("/api/workspaces").set("Authorization", f.pat).expect(200);
    expect(workspaces.body.workspaces[0]).toMatchObject({ roadmapCount: 1, roadmapDoneCount: 0, attentionCount: 1 });
    await f.approve(0).expect(200);
    expect((await view()).counts).toMatchObject({ done: 0, verification: 1 });
    await f.approve(1).expect(200);
    expect((await view()).nodes.map((n: any) => n.display_status)).toEqual(["done", "done", "done"]);
    expect(await schedule()).toMatchObject({ status: "done", done_task_count: 1, unverified_task_count: 0 });
    const verifiedWorkspaces = await request(f.app).get("/api/workspaces").set("Authorization", f.pat).expect(200);
    expect(verifiedWorkspaces.body.workspaces[0].roadmapDoneCount).toBe(1);
  } finally { await f.db.close(); }
});

it("완료 산출물이 있는 patch 취소는 기존 Task 완료 상태를 복원한다", async () => {
  const f = await fixture();
  try {
    const runtimeAssessment = {
      projectionSchemaVersion: 1,
      status: "cancelled",
      currentStage: "REVIEW_RUNNING",
      nextActions: [],
      recommendedAction: null,
      humanDecisionRequired: false,
      blockers: [],
      evidence: [],
    };
    const payload: any = structuredClone(f.payload);
    payload.nodes[0].workResult.report.completionGrade = "verified";
    payload.nodes[0].workResult.report.bypassLabels = [];
    payload.nodes[0].status = "in_progress";
    payload.nodes[0].runtimeAssessment = runtimeAssessment;
    payload.nodes[0].lineage = [
      { version: 0, title: "최초 구현", workResult: payload.nodes[0].workResult },
      { version: 1, title: "캐시 보강", workResult: payload.nodes[0].workResult },
      { version: 2, title: "취소한 문서 선택 변경" },
    ];
    payload.nodes.unshift(
      { id: "spec", title: "검색 필터", level: "spec", status: "in_progress" },
      { id: "run", title: "검색 필터", level: "workstream", status: "in_progress", parent: "spec" },
    );
    payload.nodes[2].parent = "run";
    await f.sync(payload);

    const view = (await request(f.app).get("/api/workspaces/ws/roadmap").set("Authorization", f.pat).expect(200)).body;
    expect(view.nodes.map((node: any) => node.display_status)).toEqual(["done", "done", "done"]);
    expect(view.counts).toMatchObject({ total: 1, done: 1, dropped: 0 });
    const schedule = (await request(f.app).get("/api/workspaces/schedule").set("Authorization", f.pat).expect(200)).body.specs[0];
    expect(schedule).toMatchObject({ status: "done", task_count: 1, done_task_count: 1, focus_task_status: "done" });
  } finally { await f.db.close(); }
});
