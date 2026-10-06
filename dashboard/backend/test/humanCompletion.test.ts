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
      await f.approve(0).expect(200);
      expect((await f.get()).report.completionGrade).toBe("unverified");
      await f.approve(1).expect(200);
      expect((await f.get()).report.completionGrade).toBe("verified_by_human");
      await f.sync();
      expect((await f.get()).report.completionGrade).toBe("verified_by_human");
      await f.approve(0, "revoke", "승인 판단 재검토").expect(200);
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
  it("rejects blank reasons, API/MCP credentials, unattended local login, spoofed user and stale result", async () => {
    const f = await fixture();
    try {
      await f.approve(0, "approve", " ").expect(400);
      await f.approve(0, "approve", "reviewed", f.pat).expect(403);
      await f.approve(0, "approve", "reviewed", f.local).expect(403);
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
});
