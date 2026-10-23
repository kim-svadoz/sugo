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

  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto(`${base}/home`, { waitUntil: "networkidle" });
  await page.waitForTimeout(7000);
  await page.locator('section[aria-label="오늘의 Sugo 작업 장면"]').screenshot({ path: join(out, "console-home.png") });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/sessions`, { waitUntil: "networkidle" });
  await page.getByText("payments", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await page.locator(".work-floor").first().screenshot({ path: join(out, "console-workspaces.png") });

  await page.goto(`${base}/schedule?reviewWorkspace=payments&reviewSpec=pay-spec-webhook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(out, "console-approval.png") });

  await page.goto(`${base}/schedule`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Agenda/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, "console-schedule.png") });

  await browser.close();
  console.log(`[readme-shots] ${out}`);
} finally {
  server.kill("SIGTERM");
  await rm(home, { recursive: true, force: true });
}
