/**
 * README 스크린샷 생성기.
 * 임시 HOME과 별도 포트로 번들 Console을 띄우고 데모 데이터만 넣어 찍는다. 사용자 DB(~/.claude/sugo)와 3001 포트는 쓰지 않는다.
 *
 *   cd sugo && npm run build:dashboard   # 화면을 바꿨다면 먼저 번들을 최신으로 만든다
 *   node dashboard/e2e/readme-shots.mjs  # 결과: docs/images/console-*.png
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.README_SHOTS_PORT ?? 3199);
const base = `http://localhost:${port}`;
const out = join(repo, "docs", "images");
// 화면에 보이는 프로젝트 경로가 짧도록 /tmp 아래에 둔다.
const home = await mkdtemp("/tmp/sugo-");

const env = { ...process.env, SUGO_HOME_OVERRIDE: home, SUGO_DASHBOARD_PORT: String(port), LOCAL_DEV_USER_ID: "readme-demo", LOCAL_DEV_DISPLAY_NAME: "Demo", README_DEMO_ROOT: home, SECRET_ENC_KEY: randomBytes(32).toString("base64") };
for (const key of ["SUGO_DASHBOARD_API_URL", "SUGO_DASHBOARD_API_TOKEN", "SUGO_DASHBOARD_USER_ID", "SQLITE_FILE", "SUGO_SETTINGS_FILE"]) delete env[key];

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* 아직 기동 중 */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${base}/health 응답 없음`);
}

const server = spawn(process.execPath, [join(repo, "sugo", "dashboard-runtime", "server.mjs")], { env, stdio: ["ignore", "inherit", "inherit"] });
try {
  await waitForHealth();
  const seed = spawnSync("npx", ["tsx", "readme-demo.mts"], {
    cwd: join(repo, "dashboard", "backend"),
    env: { ...env, DB_DRIVER: "sqlite", SQLITE_FILE: join(home, ".claude", "sugo", "dashboard", "dashboard.db") },
    stdio: "inherit",
  });
  if (seed.status !== 0) throw new Error("데모 데이터 시드 실패");

  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`${base}/api/auth/local`, { waitUntil: "networkidle" });
  // 처음 설정 안내가 뜨지 않도록 날씨 지역과 Weekly 설정을 채운다. 날씨는 외부 API 대신 고정 응답을 준다.
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ json: { current: { temperature_2m: 18, weather_code: 1 } } }));
  await page.evaluate(() => localStorage.setItem("sugo_weather_region", "seoul-cityhall"));
  const weeklySaved = await page.evaluate(async () => (await fetch("/api/weekly/reports/settings/current", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${JSON.parse(localStorage.getItem("sugo_auth") ?? "{}").accessToken}` }, body: JSON.stringify({ enabled: false, weekday: 5, hour: 17, minute: 0, model: "default", extraRepositories: [] }) })).status);
  if (weeklySaved !== 200) throw new Error(`weekly settings ${weeklySaved}`);

  // Home 인사말은 시각을 따른다. 언제 찍어도 낮 인사가 나오도록 Home만 지금이 낮인 시간대로 연다.
  const daytimeZone = ["Asia/Seoul", "Pacific/Kiritimati", "Pacific/Auckland", "Asia/Dubai", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Pacific/Honolulu"]
    .find((timeZone) => { const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date())); return hour >= 10 && hour < 17; }) ?? "Asia/Seoul";
  const homeContext = await browser.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 2, timezoneId: daytimeZone });
  const homePage = await homeContext.newPage();
  await homePage.goto(`${base}/api/auth/local`, { waitUntil: "networkidle" });
  await homePage.route("https://api.open-meteo.com/**", (route) => route.fulfill({ json: { current: { temperature_2m: 18, weather_code: 1 } } }));
  await homePage.evaluate(() => localStorage.setItem("sugo_weather_region", "seoul-cityhall"));
  await homePage.goto(`${base}/home`, { waitUntil: "networkidle" });
  await homePage.waitForTimeout(7000);
  // 사이드바와 상단 바까지 포함한 Home 전체. 본문은 내부 스크롤이라 화면 높이를 본문 높이로 늘려 한 번에 찍는다.
  const homeHeight = await homePage.evaluate(() => Math.max(...[...document.querySelectorAll("main, main *")].filter((el) => el.scrollHeight > el.clientHeight + 4).map((el) => el.scrollHeight), document.body.scrollHeight));
  await homePage.setViewportSize({ width: 1440, height: homeHeight + 120 });
  await homePage.waitForTimeout(1500);
  // 최근 작업 리뷰와 Engineering Feed까지 담고, 그 아래 "오늘의 리뷰" 앞에서 자른다.
  const todayReview = await homePage.getByText("오늘의 리뷰", { exact: true }).first().boundingBox().catch(() => null);
  await homePage.screenshot({ path: join(out, "console-home.png"), ...(todayReview ? { clip: { x: 0, y: 0, width: 1440, height: todayReview.y - 40 } } : {}) });
  await homeContext.close();

  // Workspaces 첫 화면: 도메인 카드, 작업장, 최근 작업 요약, Inspector를 한 장에 담는다.
  await page.setViewportSize({ width: 1440, height: 1560 });
  await page.goto(`${base}/sessions`, { waitUntil: "networkidle" });
  await page.getByText("payments", { exact: true }).first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(out, "console-workspaces.png") });
  const rulesButton = page.getByRole("button", { name: /도메인 규칙 관리/ });
  await page.locator("div").filter({ hasText: "payments" }).filter({ has: rulesButton }).last().getByRole("button", { name: /도메인 규칙 관리/ }).click();
  await page.waitForTimeout(1500);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, "console-checkpoints.png") });
  await page.keyboard.press("Escape");

  // 스펙 카드 모달. 위쪽 상태 띠가 멈춘 이유를 문장으로 보여 준다. 제목부터 지정한 요소까지 잘라 찍는다.
  await page.setViewportSize({ width: 1440, height: 1800 });
  const specModal = async (workspace, spec, title, file, bottom, extra = 24) => {
    await page.goto(`${base}/schedule?reviewWorkspace=${workspace}&reviewSpec=${spec}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    const top = await page.getByText(title, { exact: true }).last().boundingBox();
    const end = await bottom().boundingBox();
    await page.screenshot({ path: join(out, file), clip: { x: 44, y: top.y - 62, width: 1352, height: end.y + end.height + extra - (top.y - 62) } });
  };
  await specModal("account", "account-spec-2fa", "2단계 인증", "console-stop-test.png", () => page.getByText(/현재 게이트가 완료되기 전에는/).first());
  await specModal("payments", "pay-spec-refund", "부분 환불 API", "console-stop-rule.png", () => page.getByText(/현재 게이트가 완료되기 전에는/).first());
  await specModal("payments", "pay-spec-webhook", "웹훅 재처리", "console-stop-approval.png", () => page.getByRole("button", { name: "수정 요청", exact: true }).first());
  await specModal("payments", "payments-spec-coupon", "쿠폰 중복 적용 방지", "console-spec.png", () => page.getByText(/docs\/specs\/coupon\.md/).first());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/schedule?reviewWorkspace=payments&reviewSpec=pay-spec-webhook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /diff 보기/ }).first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(out, "console-diff.png") });

  // Agenda: 지난 일정, 오늘, 다음 7일, 이후 일정, 날짜 미정.
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.goto(`${base}/schedule`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Agenda/ }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(out, "console-agenda.png") });
  // 캘린더는 폭이 1900px을 넘어야 칸 안에 일정 제목을 보인다.
  await page.setViewportSize({ width: 2000, height: 1000 });
  await page.getByRole("button", { name: /Calendar/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, "console-calendar.png") });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${base}/weekly`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /주간 작업 리포트 열기/ }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(out, "console-weekly.png") });

  // 플랫폼 설정: 하네스, 외부 연동(클라우드 서비스, 프로젝트별 연결 현황), 개인 설정.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/harness`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.getByRole("tab", { name: /프레임워크/ }).first().click();
  await page.waitForTimeout(1500);
  await page.locator("button", { hasText: "Spring" }).first().click({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, "console-harness.png") });
  await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByText("외부 서비스", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(out, "console-integrations.png") });
  await page.getByText("연결 현황", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(out, "console-integration-status.png") });
  await page.goto(`${base}/preferences`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByText("주간 리포트", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, "console-preferences.png") });

  // 사용 가이드: 입력 화면을 폼 단위로 잘라 찍는다. 기준 글자의 위치에서 위로 조금, 아래로 정해진 높이만큼.
  const formShot = async (file, anchor, height, { top = 70, viewport = 1300 } = {}) => {
    await page.setViewportSize({ width: 1440, height: viewport });
    await page.waitForTimeout(800);
    const box = await anchor().boundingBox();
    await page.screenshot({ path: join(out, file), clip: { x: 230, y: Math.max(0, box.y - top), width: 1190, height } });
  };
  await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await formShot("guide-project.png", () => page.getByText("로컬 프로젝트 등록", { exact: true }).last(), 760, { top: 40, viewport: 1500 });
  await page.getByText("외부 서비스", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "환경 연결", exact: true }).first().click();
  await formShot("guide-cloud.png", () => page.getByText("AWS 연결", { exact: true }).first(), 1040, { viewport: 1500 });
  await page.getByRole("button", { name: "PR 연동", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await formShot("guide-pr.png", () => page.getByText("브랜치 확인과 PR 조회", { exact: false }).first(), 660, { top: 100 });
  await page.getByRole("button", { name: "서비스 상태 연동", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText("payments", { exact: true }).last().click().catch(() => undefined);
  await page.waitForTimeout(800);
  await page.getByText("payment-api", { exact: true }).first().click().catch(() => undefined);
  await page.waitForTimeout(1200);
  await formShot("guide-service.png", () => page.getByText("프로젝트를 선택하고 운영 서비스를 연결합니다", { exact: false }).first(), 900, { top: 100, viewport: 1500 });
  await page.getByRole("button", { name: "모니터링", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await formShot("guide-monitor.png", () => page.getByText("Pinpoint APM", { exact: true }).first(), 440);

  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.goto(`${base}/schedule`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /개발 일정 추가/ }).first().click();
  await page.waitForTimeout(1200);
  const addTitle = await page.getByRole("heading", { name: "개발 일정 추가" }).boundingBox();
  const addButton = await page.getByRole("button", { name: "SPEC 초안 추가", exact: true }).boundingBox();
  await page.screenshot({ path: join(out, "guide-schedule-add.png"), clip: { x: 186, y: addTitle.y - 40, width: 1068, height: addButton.y + addButton.height + 30 - (addTitle.y - 40) } });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1800 });
  await specModal("payments", "pay-spec-receipt", "결제 완료 메일", "guide-spec-draft.png", () => page.getByText(/docs\/specs\/receipt-mail\.md/).first());

  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.goto(`${base}/sessions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const ruleButton = page.getByRole("button", { name: /도메인 규칙 관리/ });
  await page.locator("div").filter({ hasText: "payments" }).filter({ has: ruleButton }).last().getByRole("button", { name: /도메인 규칙 관리/ }).click();
  await page.waitForTimeout(1500);
  const ruleHeading = page.getByText("새 규칙 작성", { exact: true }).first();
  await ruleHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const ruleBox = await ruleHeading.boundingBox();
  await page.screenshot({ path: join(out, "guide-rule-new.png"), clip: { x: 100, y: ruleBox.y - 30, width: 1180, height: Math.min(560, 1300 - (ruleBox.y - 30)) } });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${base}/harness`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.getByRole("tab", { name: /프레임워크/ }).first().click();
  await page.waitForTimeout(1200);
  await page.locator("button", { hasText: "Spring" }).first().click({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /내 규칙으로 수정/ }).first().click();
  await page.waitForTimeout(1000);
  const ruleSelect = await page.getByText("규칙 선택", { exact: true }).first().boundingBox();
  await page.screenshot({ path: join(out, "guide-harness-edit.png"), clip: { x: 230, y: ruleSelect.y - 30, width: 1190, height: 1100 - (ruleSelect.y - 30) } });

  // 작업장 GIF: search 도메인의 작업이 테스트에서 커밋까지 넘어가는 장면. 활동 이벤트를 차례로 넣고 화면을 연속으로 찍는다.
  if (spawnSync("ffmpeg", ["-version"]).status === 0) {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto(`${base}/sessions`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator("h3, strong, span").filter({ hasText: /^search$/ }).first().click();
    await page.waitForTimeout(3000);
    const floor = page.locator('section[aria-label="search 작업장"]');
    const box = await floor.boundingBox();
    const frames = await mkdtemp(join(tmpdir(), "sugo-floor-"));
    const ingest = (agent, handoffTo, eventType, message) => page.evaluate(async (body) => {
      const token = JSON.parse(localStorage.getItem("sugo_auth") ?? "{}").accessToken;
      await fetch("/api/activity/ingest", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    }, { userId: "readme-demo", workspace: "search", level: "AGENT", agent, handoffTo, eventType, message, details: { task: { id: "search-task-typo", name: "교정 검색어 생성" } } });
    const steps = [
      [2, "TEST", "REVIEW", "HANDOFF", "typo-correction 테스트 31/31 통과"],
      [8, "REVIEW", "DOCS", "HANDOFF", "typo-correction 검증 완료, 사용자 승인"],
      [14, "DOCS", "MAIN", "HANDOFF", "typo-correction 문서 갱신"],
      [20, "MAIN", null, "COMPLETED", "결과가 없으면 교정 검색어를 제안한다.\n테스트 31건 통과."],
    ];
    const start = Date.now();
    let frame = 0;
    while (Date.now() - start < 27_000) {
      const elapsed = (Date.now() - start) / 1000;
      while (steps.length && steps[0][0] <= elapsed) { const [, ...event] = steps.shift(); await ingest(...event); }
      await page.screenshot({ path: join(frames, `f${String(frame++).padStart(4, "0")}.png`), clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } });
      await page.waitForTimeout(120);
    }
    const fps = Math.max(1, Math.round(frame / 27));
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps * 2), "-i", join(frames, "f%04d.png"),
      "-vf", "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", join(out, "console-workfloor.gif")], { stdio: "inherit" });
    await rm(frames, { recursive: true, force: true });
  }

  await browser.close();
  console.log(`[readme-shots] ${out}`);
} finally {
  server.kill("SIGTERM");
  await rm(home, { recursive: true, force: true });
}
