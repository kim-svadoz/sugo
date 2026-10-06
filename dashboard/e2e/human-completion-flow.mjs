// node --import ./register-source.mjs human-completion-flow.mjs <screenshots-dir>
// Frontend preview built with VITE_API_BASE=http://localhost:4000, :4173.
// Real HTTP + DB + Chromium flow; screenshots directory may be passed as argv[2].
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
process.env.CORS_ORIGINS = "http://localhost:4173";
const { createApp } = await import("../backend/src/index.ts");
const { createSqliteClient } = await import("../backend/src/db/sqliteClient.ts");
const { issueSession } = await import("../backend/src/auth/session.ts");
const db = createSqliteClient();
await db.execScript(readFileSync(new URL("../backend/test/schema.sqlite.sql", import.meta.url), "utf8"));
const secret = "isolated-human-completion-e2e-secret";
const { app } = await createApp({ db, sessionSecret: secret });
const server = await new Promise(resolve => { const s = app.listen(4000, "127.0.0.1", () => resolve(s)); });
let browser;
try {
  const userId = "human-e2e";
  await db.exec("INSERT INTO sugo_users (id, display_name) VALUES (?, ?)", [userId, userId]);
  const token = await issueSession(userId, secret);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const post = async (path, body) => { const r = await fetch(`http://127.0.0.1:4000${path}`, { method: "POST", headers, body: JSON.stringify(body) }); assert.equal(r.status, 200, await r.text()); };
  await post("/api/sync/workspace", { userId, name: "human-e2e", projects: [] });
  const labels = ["evidenceResnapshot", "runtimeUnverified"].map((kind, i) => ({ kind, reason: i ? "로컬 실행환경 부재" : "RankingModule23Test 6/6, 로컬 의존 테스트 2건 제외", patchVersion: 0, recordedAt: `2026-10-02T00:00:0${i}Z` }));
  const workResult = { path: "/work/work-result.md", parentTaskId: "task-1", report: { schemaVersion: 1, kind: "feat", patchVersion: 0, completedAt: "2026-10-02", completionGrade: "unverified", bypassLabels: labels, summary: "인기 목록 화면 추가", changedFiles: ["RankingModule.java"], designDecisions: [], knownLimitations: [], verification: { test: { command: "gradlew check", total: 6, passed: 6, state: "pass" }, runtimeVerified: false } } };
  const runtimeAssessment = { projectionSchemaVersion: 1, status: "completed", currentStage: "DONE", nextActions: [], recommendedAction: null, humanDecisionRequired: false, blockers: ["analyze 미통과(partial)"], evidence: [] };
  await post("/api/sync/roadmap", { userId, workspaceName: "human-e2e", nodes: [
    { id: "spec-1", title: "사람 승인 SPEC", level: "spec", status: "done" },
    { id: "run-1", title: "사람 승인 RUN", parent: "spec-1", level: "workstream", status: "done", workResult },
    { id: "task-1", title: "인기 목록 화면 추가", parent: "run-1", level: "task", status: "done", workResult, runtimeAssessment },
  ] });
  browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(({ token, userId }) => localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: userId }, accessToken: token, refreshToken: null, expiresAt: Date.now() + 3600000 })), { token, userId });
  await page.goto("http://localhost:4173/roadmap/human-e2e?focus=task-1");
  await page.getByRole("heading", { name: "미검증 사유" }).waitFor();
  await page.getByRole("heading", { name: "참고용 경고 · 완료등급과 별개" }).waitFor();
  const shots = process.argv[2]; if (shots) mkdirSync(shots, { recursive: true });
  const shot = async name => { if (shots) await page.screenshot({ path: join(shots, name + ".png"), fullPage: true }); };
  const review = page.locator("#completion-review");
  assert.equal(await review.locator("..").locator("..").locator("span.font-semibold").filter({ hasText: /^미검증$/ }).count(), 1);
  assert.equal(await review.getByRole("button", { name: "사람 승인", exact: true }).count(), 2);
  assert.equal(await page.getByText("✅ 작업완료", { exact: true }).count(), 0);
  await page.getByText("검증 1", { exact: true }).first().waitFor();
  await shot("human-unverified");
  await page.getByRole("textbox", { name: "evidenceResnapshot 승인 사유", exact: true }).fill("로컬 환경 의존 테스트 2건 제외, 코드와 무관");
  await page.getByRole("button", { name: "사람 승인", exact: true }).first().click();
  await page.getByRole("textbox", { name: "evidenceResnapshot 승인 취소 사유" }).waitFor();
  await page.getByText("미검증", { exact: true }).first().waitFor();
  await shot("human-partial");
  await page.getByRole("textbox", { name: "runtimeUnverified 승인 사유" }).fill("배포 환경에서 사람이 실행 결과를 확인함");
  await page.getByRole("button", { name: "사람 승인", exact: true }).click();
  await page.getByText("사람 승인 검증완료", { exact: true }).last().waitFor();
  await page.getByText("✅ 작업완료", { exact: true }).waitFor();
  await page.getByText("완료 1", { exact: true }).waitFor();
  await shot("human-approved");
  await page.getByRole("textbox", { name: "evidenceResnapshot 승인 취소 사유" }).fill("승인 판단 재검토");
  await page.getByRole("button", { name: "사람 승인 취소", exact: true }).first().click();
  await page.getByRole("textbox", { name: "evidenceResnapshot 승인 사유", exact: true }).waitFor();
  await page.getByText("미검증", { exact: true }).first().waitFor();
  await page.getByText("사람 승인 감사 기록 (3)").waitFor();
  await shot("human-revoked");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "passed", partialApproval: "unverified", fullApproval: "verified_by_human", revoked: "unverified", pageErrors: errors.length }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
