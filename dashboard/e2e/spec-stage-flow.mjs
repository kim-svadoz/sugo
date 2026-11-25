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
const ready = { ...draft, id: "spec-ready", title: "결제 내역 개선", due_date: `${month}-12`, spec_path: "/example/spec.md", spec_written_at: new Date(Date.now() - 8 * 60_000).toISOString() };
const done = { ...ready, id: "spec-done", title: "상품 목록 개선", due_date: `${month}-13`, status: "done", has_run: true };
const awaitingApproval = {
  ...ready, id: "spec-review", title: "배송 상태 화면 개선", due_date: `${month}-14`, status: "blocked", has_run: true,
  focus_task_status: "blocked", focus_task_human_blocker: { kind: "review_confirmation" },
};
const running = { ...ready, id: "spec-running", title: "배송 알림 개선", due_date: `${month}-15`, status: "in_progress", has_run: true };
const specs = [draft, ready, done, awaitingApproval, running];
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
      "/api/workspaces/shop/task-projects": { projects: {} },
      "/api/workspaces": { workspaces: [{ name: "shop", projects: [], lastActivityAt: new Date().toISOString(), attentionCount: 0 }] },
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });

  await page.goto(`${E2E_UI_URL}/schedule`);
  await page.getByRole("button", { name: "Agenda" }).click();
  const badges = ["SPEC 작성 중", "SPEC 작성 완료", "파이프라인 완료", "사용자 승인 대기", "진행 중"];
  for (const label of badges) await page.getByText(label, { exact: true }).waitFor();
  const reviewCard = page.getByRole("button", { name: /배송 상태 화면 개선/ });
  await reviewCard.getByText("사용자 승인 대기", { exact: true }).waitFor();
  const activeBadge = page.getByText("진행 중", { exact: true });
  const activeDot = activeBadge.locator('[aria-hidden="true"]');
  const animationName = (locator) => locator.evaluate((element) => getComputedStyle(element).animationName);
  assert.equal(await animationName(activeDot), "pulse");
  assert.equal(await animationName(activeBadge), "none");
  assert.equal(await reviewCard.getByText("사용자 승인 대기", { exact: true }).locator('[aria-hidden="true"]').count(), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await animationName(activeDot), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.screenshot({ path: join(output, "agenda.png") });

  await page.getByRole("button", { name: "Calendar" }).click();
  const reviewMarker = page.getByRole("button", { name: "개발 일정 · 배송 상태 화면 개선 · 사용자 승인 대기" });
  await reviewMarker.hover();
  const preview = await reviewMarker.getByText("일정 미리보기").locator("..").elementHandle();
  await reviewMarker.getByText("사용자 승인 대기", { exact: true }).waitFor();
  await page.waitForFunction((element) => getComputedStyle(element).opacity === "1", preview);
  const runningMarker = page.getByRole("button", { name: "개발 일정 · 배송 알림 개선 · 진행 중" });
  assert.equal(await animationName(runningMarker.locator(':scope > [aria-hidden="true"]').nth(1)), "pulse");
  await runningMarker.hover();
  const runningPreview = await runningMarker.getByText("일정 미리보기").locator("..").elementHandle();
  await page.waitForFunction((element) => getComputedStyle(element).opacity === "1", runningPreview);
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
  assert.equal(await animationName(activeDot.filter({ visible: true })), "pulse");
  await page.screenshot({ path: join(output, "calendar-wide.png") });

  specs[3] = {
    ...awaitingApproval,
    focus_task_blocker_decision: { response: "승인", answered_by: "e2euser", answered_at: new Date().toISOString() },
  };
  await page.reload();
  await page.getByRole("button", { name: "Agenda" }).click();
  await reviewCard.waitFor();
  assert.equal(await reviewCard.getByText("사용자 승인 대기", { exact: true }).count(), 0);
  specs.splice(3);

  specs.push({ ...ready, id: "other-ready", title: "장바구니 개선", spec_written_at: new Date(Date.now() - 2 * 3_600_000).toISOString() });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${E2E_UI_URL}/sessions?workspace=shop`);
  const activeCard = page.locator(".domain-swipe-slide:not([inert])");
  const rail = activeCard.getByRole("list", { name: "작업 단계" });
  await activeCard.getByText("스펙 작성을 마쳤어요 · 작업 지시 대기").waitFor();
  assert.match(await rail.locator("li").nth(0).textContent(), /스펙 작성/);
  assert.match(await rail.locator("li").nth(1).textContent(), /작업 지시/);
  await rail.locator('li[aria-label="스펙 작성 완료"]').waitFor();
  await activeCard.getByText("결제 내역 개선", { exact: true }).waitFor();
  await activeCard.getByText(/스펙 작성 \d+분 전/).waitFor();
  const swipe = page.locator(".domain-swipe");
  assert.match(await swipe.evaluate((element) => getComputedStyle(element).touchAction), /pan-y/);
  const { x, y, width } = await swipe.boundingBox();
  const start = { x: x + width / 2, y: y + 55 };
  const drag = async (dx, dy, onHold) => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
    await onHold?.();
    await page.mouse.up();
  };
  await drag(-100, 0, async () => {
    assert.equal(await swipe.getAttribute("data-dragging"), "");
    const followed = await activeCard.boundingBox();
    assert.ok(Math.abs(followed.x - x + 100) < 3, "the card follows the pointer at Console zoom");
  });
  await activeCard.getByText("장바구니 개선", { exact: true }).waitFor();
  await activeCard.getByText("스펙 작성 2시간 전").waitFor();
  await page.getByText("작업 2/2", { exact: true }).waitFor();
  const next = page.getByRole("button", { name: "다음 작업" });
  assert.equal(await next.getAttribute("aria-disabled"), "true");
  await page.getByRole("button", { name: "이전 작업" }).press("Enter");
  await activeCard.getByText("결제 내역 개선", { exact: true }).waitFor();
  await page.getByText("작업 1/2", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".domain-swipe-slide:not([inert])").getAnimations().length === 0);
  await drag(-22, 0);
  assert.equal(await swipe.getAttribute("data-dragging"), null);
  await drag(-12, 45);
  assert.equal(await swipe.getAttribute("data-dragging"), null);
  await activeCard.getByText("결제 내역 개선", { exact: true }).waitFor();
  const touch = await page.context().newCDPSession(page);
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x - 110, y: start.y }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await activeCard.getByText("장바구니 개선", { exact: true }).waitFor();
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await touch.detach();
  await page.getByRole("button", { name: "이전 작업" }).click();
  await activeCard.getByText("결제 내역 개선", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".domain-swipe-slide:not([inert])").getAnimations().length === 0);
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
  await activeCard.getByText("결제 내역 개선", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "domain-running.png") });
  await page.goto(`${E2E_UI_URL}/schedule`);
  await page.getByText("진행 중", { exact: true }).waitFor();

  specs.pop();
  specs[1] = { ...specs[1], status: "done" };
  events.push({
    id: 3, workspace_name: "shop", ts: new Date().toISOString(), level: "info", agent: "MAIN",
    handoff_to: null, event_type: "COMPLETED", message: "결제 내역 구현 완료", details,
  });
  await page.goto(`${E2E_UI_URL}/sessions?workspace=shop`);
  await activeCard.getByText("개발을 마쳤어요", { exact: true }).waitFor();
  await activeCard.getByText("일정 열림", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "domain-completed-open.png") });
  specs.splice(1, 1);
  await activeCard.getByText("일정 열림", { exact: true }).waitFor({ state: "hidden" });
  await activeCard.getByText("개발을 마쳤어요", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`SPEC stage screenshots saved to ${output}`);
} finally {
  await browser.close();
}
