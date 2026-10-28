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

/** Home 엔지니어링 피드 예시. 외부 RSS 대신 이 브라우저 안에서만 응답을 고정한다. 실제 회사·블로그 이름을 쓰지 않는다. */
function demoNewsFeed() {
  const sources = [
    ["Platform Notes", "플랫폼", "ko"], ["Backend Diary", "백엔드", "ko"], ["Data Craft", "데이터", "ko"],
    ["Scale Weekly", "Infrastructure", "en"], ["Testing Field Guide", "Quality", "en"], ["Frontend Journal", "Frontend", "en"],
  ].map(([name, category, language]) => ({ name, category, language, url: "https://example.com", status: "active", lastPublishedAt: new Date().toISOString() }));
  const titles = [
    [0, "배포 파이프라인을 10분에서 3분으로 줄인 과정"], [3, "Designing idempotent payment APIs"], [1, "Kotlin 코루틴으로 외부 API 병렬 호출 다루기"],
    [4, "Contract tests that catch breaking changes early"], [2, "실시간 집계 파이프라인 운영 기록"], [5, "Rendering large tables without jank"],
    [0, "멀티 리전 Redis 장애 대응 훈련"], [3, "Rate limiting at the edge"], [1, "트랜잭션 아웃박스 패턴 도입기"],
    [4, "Flaky test triage playbook"], [2, "Athena 비용을 절반으로 줄인 파티션 설계"], [5, "Accessibility checks in CI"],
  ];
  const items = titles.map(([source, title], index) => ({
    source: sources[source].name, category: sources[source].category, language: sources[source].language,
    title, url: `https://example.com/posts/${index + 1}`, publishedAt: new Date(Date.now() - index * 11 * 3_600_000).toISOString(), summary: null,
  }));
  return { items, fetchedAt: new Date().toISOString(), sourceCount: sources.length, sources };
}

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
  await page.route("**/api/news**", (route) => route.fulfill({ json: demoNewsFeed() }));
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
  await homePage.route("**/api/news**", (route) => route.fulfill({ json: demoNewsFeed() }));
  await homePage.route("https://api.open-meteo.com/**", (route) => route.fulfill({ json: { current: { temperature_2m: 18, weather_code: 1 } } }));
  await homePage.evaluate(() => localStorage.setItem("sugo_weather_region", "seoul-cityhall"));
  await homePage.goto(`${base}/home`, { waitUntil: "networkidle" });
  await homePage.waitForTimeout(7000);
  // 사이드바와 상단 바까지 포함한 Home 전체. 본문은 내부 스크롤이라 화면 높이를 본문 높이로 늘려 한 번에 찍는다.
  const homeHeight = await homePage.evaluate(() => Math.max(...[...document.querySelectorAll("main, main *")].filter((el) => el.scrollHeight > el.clientHeight + 4).map((el) => el.scrollHeight), document.body.scrollHeight));
  await homePage.setViewportSize({ width: 1440, height: homeHeight + 120 });
  await homePage.waitForTimeout(1500);
  await homePage.screenshot({ path: join(out, "console-home.png") });
  // README용 Home 첫 화면: 인사, 오늘의 할 일, 작업 흐름까지.
  const flowPanel = await homePage.getByText("TODAY IN SUGO", { exact: true }).first().locator("xpath=ancestor::section[1]").boundingBox().catch(() => null);
  await homePage.screenshot({ path: join(out, "console-home-top.png"), clip: { x: 0, y: 0, width: 1440, height: flowPanel ? flowPanel.y + flowPanel.height + 24 : 980 } });
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
