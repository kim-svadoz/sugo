/**
 * README 스크린샷 생성기.
 * 임시 HOME과 별도 포트로 번들 Console을 띄우고 데모 데이터만 넣어 찍는다. 사용자 DB(~/.claude/sugo)와 3001 포트는 쓰지 않는다.
 *
 *   cd sugo && npm run build:dashboard   # 화면을 바꿨다면 먼저 번들을 최신으로 만든다
 *   node dashboard/e2e/readme-shots.mjs  # 결과: docs/images/console-*.png
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.README_SHOTS_PORT ?? 3199);
const base = `http://localhost:${port}`;
const out = join(repo, "docs", "images");
const home = await mkdtemp(join(tmpdir(), "sugo-readme-"));

const env = { ...process.env, SUGO_HOME_OVERRIDE: home, SUGO_DASHBOARD_PORT: String(port), LOCAL_DEV_USER_ID: "readme-demo", LOCAL_DEV_DISPLAY_NAME: "Demo", README_DEMO_ROOT: home };
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
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${base}/api/auth/local`, { waitUntil: "networkidle" });
  await page.route("**/api/news**", (route) => route.fulfill({ json: demoNewsFeed() }));
  // 처음 설정 안내가 뜨지 않도록 날씨 지역과 Weekly 설정을 채운다. 날씨는 외부 API 대신 고정 응답을 준다.
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ json: { current: { temperature_2m: 18, weather_code: 1 } } }));
  await page.evaluate(() => localStorage.setItem("sugo_weather_region", "seoul-cityhall"));
  const weeklySaved = await page.evaluate(async () => (await fetch("/api/weekly/reports/settings/current", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${JSON.parse(localStorage.getItem("sugo_auth") ?? "{}").accessToken}` }, body: JSON.stringify({ enabled: false, weekday: 5, hour: 17, minute: 0, model: "default", extraRepositories: [] }) })).status);
  if (weeklySaved !== 200) throw new Error(`weekly settings ${weeklySaved}`);

  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto(`${base}/home`, { waitUntil: "networkidle" });
  await page.waitForTimeout(7000);
  // 사이드바와 상단 바까지 포함한 Home 전체. 본문은 내부 스크롤이라 화면 높이를 본문 높이로 늘려 한 번에 찍는다.
  const homeHeight = await page.evaluate(() => Math.max(...[...document.querySelectorAll("main, main *")].filter((el) => el.scrollHeight > el.clientHeight + 4).map((el) => el.scrollHeight), document.body.scrollHeight));
  await page.setViewportSize({ width: 1440, height: homeHeight + 120 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, "console-home.png") });

  // 작업장, 연결 레일, 최근 작업 요약을 한 장에 담는다.
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto(`${base}/sessions`, { waitUntil: "networkidle" });
  await page.getByText("payments", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  const floor = await page.locator('section[aria-label="payments 작업장"]').boundingBox();
  const summary = await page.locator(".command-detail").first().boundingBox();
  await page.screenshot({ path: join(out, "console-workspaces.png"), fullPage: true, clip: { x: floor.x - 8, y: floor.y - 8, width: floor.width + 16, height: summary.y + 300 - floor.y } });
  // 도메인 관리: 도메인 목록과 선택한 도메인의 프로젝트, 도메인 규칙.
  await page.screenshot({ path: join(out, "console-domains.png"), fullPage: true, clip: { x: 0, y: 0, width: 1440, height: floor.y - 8 } });
  const rulesButton = page.getByRole("button", { name: /도메인 규칙 관리/ });
  await page.locator("div").filter({ hasText: "payments" }).filter({ has: rulesButton }).last().getByRole("button", { name: /도메인 규칙 관리/ }).click();
  await page.waitForTimeout(1500);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, "console-checkpoints.png") });
  await page.keyboard.press("Escape");

  await page.goto(`${base}/schedule?reviewWorkspace=payments&reviewSpec=pay-spec-webhook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(out, "console-approval.png") });
  await page.getByRole("button", { name: /diff 보기/ }).first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(out, "console-diff.png") });

  await page.goto(`${base}/schedule`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Agenda/ }).first().click();
  await page.waitForTimeout(1500);
  // 캘린더는 폭이 1900px을 넘어야 칸 안에 일정 제목을 보인다.
  await page.setViewportSize({ width: 2000, height: 1000 });
  await page.getByRole("button", { name: /Calendar/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, "console-calendar.png") });

  await browser.close();
  console.log(`[readme-shots] ${out}`);
} finally {
  server.kill("SIGTERM");
  await rm(home, { recursive: true, force: true });
}
