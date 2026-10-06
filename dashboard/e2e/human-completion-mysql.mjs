// MYSQL_HOST/PORT/USER/PASSWORD control the test server. Uses a fresh isolated DB; drops only that DB.
// node --import ./register-source.mjs human-completion-mysql.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createMySqlClient } from "../backend/src/db/mysqlClient.ts";
import { createApp } from "../backend/src/index.ts";
import { issueSession } from "../backend/src/auth/session.ts";
import { completionLabelId, ensureHumanCompletionTable } from "../backend/src/services/humanCompletion.ts";
const connection = { host: process.env.MYSQL_HOST ?? "127.0.0.1", port: Number(process.env.MYSQL_PORT ?? 33077), user: process.env.MYSQL_USER ?? "root", password: process.env.MYSQL_PASSWORD ?? "" };
const database = `sugo_approval_test_${randomBytes(6).toString("hex")}`;
const admin = createMySqlClient({ ...connection, database: "" });
let db, server;
try {
  await admin.exec(`CREATE DATABASE ${database} CHARACTER SET utf8mb4`);
  db = createMySqlClient({ ...connection, database });
  await db.execScript(readFileSync(new URL("../backend/src/db/schema.mysql.sql", import.meta.url), "utf8"));
  await db.execScript(readFileSync(new URL("../backend/src/db/human-completion.mysql.sql", import.meta.url), "utf8"));
  await ensureHumanCompletionTable(db);
  await ensureHumanCompletionTable(db);
  const secret = "mysql-human-completion-test-secret";
  const { app } = await createApp({ db, sessionSecret: secret });
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = await issueSession("mysql-human", secret);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const post = async (path, body) => { const r = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) }); assert.equal(r.status, 200, await r.text()); };
  const labels = ["evidenceResnapshot", "runtimeUnverified"].map((kind, i) => ({ kind, reason: `한글 원래 사유 ${i} "JSON"`, patchVersion: 0, recordedAt: `2026-10-02T00:00:0${i}Z` }));
  const payload = { workspaceName: "ws", nodes: [{ id: "task", title: "task", level: "task", status: "done", workResult: { path: "/work-result.md", report: { schemaVersion: 1, patchVersion: 0, completedAt: "2026-10-02", completionGrade: "unverified", bypassLabels: labels } } }] };
  await post("/api/sync/roadmap", payload);
  const get = async () => { const r = await fetch(base + "/api/workspaces/ws/roadmap", { headers }); assert.equal(r.status, 200); return (await r.json()).nodes[0].work_result; };
  const view = async () => (await fetch(base + "/api/workspaces/ws/roadmap", { headers })).json();
  assert.equal((await view()).nodes[0].display_status, "verification");
  assert.equal((await view()).counts.done, 0);
  const key = (await get()).approvalResultKey;
  const approve = (i, action = "approve") => post("/api/workspaces/ws/roadmap/completion-approval", { nodeId: "task", resultKey: key, labelId: completionLabelId(labels[i]), action, reason: "사람의 검토 사유" });
  await approve(0); assert.equal((await get()).report.completionGrade, "unverified");
  await approve(1); assert.equal((await get()).report.completionGrade, "verified_by_human");
  assert.equal((await view()).nodes[0].display_status, "done");
  assert.equal((await view()).counts.done, 1);
  await post("/api/sync/roadmap", payload); assert.equal((await get()).report.completionGrade, "verified_by_human");
  await approve(0, "revoke"); assert.equal((await get()).report.completionGrade, "unverified");
  assert.equal((await get()).report.humanApprovals.length, 3);
  assert.deepEqual((await get()).report.bypassLabels, labels);
  console.log(JSON.stringify({ mysql: (await db.query("SELECT VERSION() AS version"))[0].version, auditEvents: 3, partial: "unverified", approved: "verified_by_human", revoked: "unverified", resyncPreserved: true }));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await db?.close();
  await admin.exec(`DROP DATABASE IF EXISTS ${database}`);
  await admin.close();
}
