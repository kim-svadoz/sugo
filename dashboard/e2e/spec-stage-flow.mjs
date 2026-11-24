import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { E2E_UI_URL } from "../port-contract.mjs";

const output = process.argv[2] ?? join(tmpdir(), "sugo-spec-stage");
await mkdir(output, { recursive: true });
const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()).slice(0, 7);
const draft = {
  id: "spec-draft", workspace_name: "shop", title: "주문 내역 개선", status: "pending",
  due_date: `${month}-11`,
  project_path: "/example/shop", spec_path: null, has_run: false,
};
const ready = { ...draft, id: "spec-ready", title: "결제 내역 개선", due_date: `${month}-12`, spec_path: "/example/spec.md" };
const done = { ...ready, id: "spec-done", title: "상품 목록 개선", due_date: `${month}-13`, status: "done", has_run: true };
const specs = [draft, ready, done];
const events = [];

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("sugo_auth", JSON.stringify({
      user: { id: "e2euser" }, accessToken: "fake.jwt.token", refreshToken: null, expiresAt: Date.now() + 3600000,
    }));
  });
  await page.route("**/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses = {
      "/api/workspaces/schedule": { specs },
      "/api/schedule/specs/archive": { specs: [] },
      "/api/schedule/memos": { memos: [] },
      "/api/schedule/memos/archive": { memos: [] },
      "/api/schedule/commitments": { commitments: [] },
      "/api/activity/stream": { events },
      "/api/workspaces": { workspaces: [{ name: "shop", projects: [], lastActivityAt: new Date().toISOString(), attentionCount: 0 }] },
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });

  await page.goto(`${E2E_UI_URL}/schedule`);
  await page.getByRole("button", { name: "Agenda" }).click();
  const badges = ["SPEC 작성 중", "SPEC 작성 완료", "파이프라인 완료"];
  for (const label of badges) await page.getByText(label, { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "agenda.png") });

  await page.getByRole("button", { name: "Calendar" }).click();
  const readyMarker = page.getByRole("button", { name: "개발 일정 · 결제 내역 개선 · SPEC 작성 완료" });
  await readyMarker.hover();
  await readyMarker.getByText("SPEC 작성 완료", { exact: true }).waitFor();
  const preview = await readyMarker.getByText("일정 미리보기").locator("..").elementHandle();
  await page.waitForFunction((element) => getComputedStyle(element).opacity === "1", preview);
  await page.screenshot({ path: join(output, "calendar-compact.png") });
  await page.setViewportSize({ width: 2000, height: 900 });
  await page.reload();
  await page.getByRole("button", { name: "Calendar" }).click();
  for (const label of badges) {
    const badge = page.getByText(label, { exact: true }).filter({ visible: true });
    await badge.waitFor();
    assert.equal(await badge.evaluate((element) => {
      const scroller = element.closest(".overflow-y-auto");
      return element.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().bottom;
    }), true, `${label} fits inside its calendar cell`);
  }
  await page.screenshot({ path: join(output, "calendar-wide.png") });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${E2E_UI_URL}/sessions?workspace=shop`);
  const rail = page.getByRole("list", { name: "작업 단계" });
  await page.getByText("스펙 작성을 마쳤어요 · 작업 지시 대기").waitFor();
  assert.match(await rail.locator("li").nth(0).textContent(), /스펙 작성/);
  assert.match(await rail.locator("li").nth(1).textContent(), /작업 지시/);
  await rail.locator('li[aria-label="스펙 작성 완료"]').waitFor();
  await page.screenshot({ path: join(output, "domain-ready.png") });

  specs[1] = { ...ready, status: "in_progress", has_run: true, task_ids: ["task-ready"] };
  await page.getByText("작업 활동 기록을 기다려요").waitFor();
  const details = { task: { id: "task-ready", name: "내부 작업명" } };
  events.push({
    id: 1, workspace_name: "shop", ts: new Date().toISOString(), level: "info", agent: "MAIN",
    handoff_to: null, event_type: "EXECUTE", message: "결제 내역 작업 지시", details,
  });
  await page.getByText("작업 지시 진행 중").waitFor();
  assert.match(await rail.locator('li[aria-current="step"]').textContent(), /작업 지시/);
  events.push({
    id: 2, workspace_name: "shop", ts: new Date().toISOString(), level: "info", agent: "MAIN",
    handoff_to: "CODE", event_type: "HANDOFF", message: "결제 내역 구현 시작", details,
  });
  await page.getByText("구현 진행 중").waitFor();
  await rail.locator('li[aria-label="스펙 작성 완료"]').waitFor();
  assert.match(await rail.locator('li[aria-current="step"]').textContent(), /구현/);
  assert.equal(await page.getByRole("button", { name: "다음 작업장" }).count(), 0);
  await page.screenshot({ path: join(output, "domain-running.png") });
  await page.goto(`${E2E_UI_URL}/schedule`);
  await page.getByText("진행 중", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`SPEC stage screenshots saved to ${output}`);
} finally {
  await browser.close();
}
