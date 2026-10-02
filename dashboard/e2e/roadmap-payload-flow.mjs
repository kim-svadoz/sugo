// Run with backend's tsx: npx tsx ../e2e/roadmap-payload-flow.mjs <screenshot.png>
// Requires a frontend preview built with VITE_API_BASE=http://localhost:4000 on :4173.
// Uses an isolated real SQLite HTTP server, production serializer and real browser (no API mocks).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serializeRoadmapSnapshot } from "../../sugo/src/dashboard/serialize.ts";

process.env.CORS_ORIGINS = "http://localhost:4173";
const { createApp } = await import("../backend/src/index.ts");
const { createSqliteClient } = await import("../backend/src/db/sqliteClient.ts");
const { issueSession } = await import("../backend/src/auth/session.ts");
const db = createSqliteClient();
await db.execScript(readFileSync(new URL("../backend/test/schema.sqlite.sql", import.meta.url), "utf8"));
const secret = "isolated-payload-e2e-session-secret";
const { app } = await createApp({ db, sessionSecret: secret });
const server = await new Promise((resolve, reject) => {
  const listener = app.listen(4000, "127.0.0.1", () => resolve(listener));
  listener.on("error", reject);
});
let browser;
try {
  const userId = "payload-e2e";
  await db.exec("INSERT INTO sugo_users (id, display_name) VALUES (?, ?)", [userId, userId]);
  const token = await issueSession(userId, secret);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const post = async (endpoint, body) => {
    const response = await fetch(`http://127.0.0.1:4000${endpoint}`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(response.status, 200, await response.text());
  };
  await post("/api/sync/workspace", { userId, name: "payload-e2e", projects: [], gitSyncedProjects: [] });
  const assessment = { projectionSchemaVersion: 1, status: "completed", currentStage: "DONE", nextActions: [], recommendedAction: null, humanDecisionRequired: false, blockers: [], evidence: [] };
  const result = { path: "/work/work-result.md", summary: "파일 본문 없이 동기화된 완료 요약", runtimeVerified: true, files: [{ path: "src/example.ts", change: "modified", content: "한".repeat(100_000), diff: "+added\n-removed" }] };
  const tasks = Array.from({ length: 30 }, (_, index) => ({ id: `task-${index}`, title: `완료 작업 ${index + 1}`, level: "task", status: "done", dependsOn: [], parent: "run-001", note: "DONE", runtimeAssessment: assessment, workResult: result, lineage: [{ version: 0, completedAt: new Date().toISOString(), summary: result.summary, workResult: result }] }));
  const payload = serializeRoadmapSnapshot(userId, "payload-e2e", [
    { id: "spec-001", title: "페이로드 검증 SPEC", level: "spec", status: "done", dependsOn: [] },
    { id: "run-001", title: "완료 RUN", level: "workstream", status: "done", dependsOn: [], parent: "spec-001", workResult: result },
    ...tasks,
  ]);
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(bytes < 1024 * 1024);
  await post("/api/sync/roadmap", payload);
  const response = await fetch("http://127.0.0.1:4000/api/workspaces/payload-e2e/roadmap", { headers });
  assert.equal(response.status, 200);
  const stored = await response.json();
  assert.equal(stored.nodes.find((n) => n.id === "task-0").runtime_assessment.currentStage, "DONE");
  browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ token, userId }) => localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: userId }, accessToken: token, refreshToken: null, expiresAt: Date.now() + 3600000 })), { token, userId });
  await page.goto("http://localhost:4173/roadmap/payload-e2e?focus=task-0");
  await page.getByRole("button", { name: "작업 요약", exact: true }).click();
  await page.getByText(result.summary, { exact: true }).first().waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  console.log(JSON.stringify({ bytes, tasks: tasks.length, status: "done", stage: "DONE", summary: result.summary, pageErrors: errors.length }));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
}
