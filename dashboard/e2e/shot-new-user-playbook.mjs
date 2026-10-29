import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.SUGO_UI_URL ?? "http://127.0.0.1:5175";
const output = process.env.SUGO_SCREENSHOT ?? join(tmpdir(), "sugo-new-user-playbook-guide.png");
const stepsOutput = process.env.SUGO_STEPS_SCREENSHOT ?? join(tmpdir(), "sugo-new-user-playbook-steps.png");
const loginOutput = process.env.SUGO_LOGIN_SCREENSHOT ?? join(tmpdir(), "sugo-workspace-gate.png");
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: {
    width: Number(process.env.SUGO_VIEWPORT_WIDTH ?? 1440),
    height: Number(process.env.SUGO_VIEWPORT_HEIGHT ?? 900),
  },
  deviceScaleFactor: 1,
});
await page.addInitScript(() => {
  localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: "new-user" }, accessToken: "fake.jwt.token", refreshToken: null, expiresAt: Date.now() + 3_600_000 }));
  localStorage.setItem("sugo_weather_region", "seoul-cityhall");
  localStorage.removeItem("sugo.onboarding.tour.hiddenOn");
});
await page.route("**/health", (route) => route.fulfill({ json: { status: "ok", version: "test", build: "test" } }));
await page.route("**/api/**", (route) => {
  const url = route.request().url();
  if (url.includes("/api/workspaces/onboarding-status")) return route.fulfill({ json: { hasCompletedPipeline: false, shouldGuideToPlaybook: true } });
  if (url.includes("/api/workspaces/schedule")) return route.fulfill({ json: { specs: [] } });
  if (url.includes("/api/schedule/commitments")) return route.fulfill({ json: { commitments: [] } });
  if (url.includes("/api/schedule/memos")) return route.fulfill({ json: { memos: [] } });
  if (url.includes("/api/schedule/specs/archive")) return route.fulfill({ json: { specs: [] } });
  if (url.includes("/api/profile")) return route.fulfill({ json: { profile: { displayName: "새 사용자" } } });
  if (url.includes("/api/preferences/weekly") || url.includes("/api/weekly/settings")) return route.fulfill({ json: { configured: true } });
  if (url.includes("/api/news")) return route.fulfill({ json: { items: [], fetchedAt: new Date().toISOString(), sourceCount: 0, sources: [] } });
  if (url.includes("/api/sync/plugin-version")) return route.fulfill({ json: { version: "test" } });
  return route.fulfill({ json: {} });
});
await page.goto(`${base}/home`, { waitUntil: "networkidle" });
await page.getByRole("dialog", { name: "Sugo 시작 안내" }).waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: output, fullPage: false });
console.log(output);
for (let step = 0; step < 3; step += 1) {
  await page.getByRole("button", { name: "다음" }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(tmpdir(), `sugo-new-user-playbook-step-${step + 2}.png`), fullPage: false });
}
await page.screenshot({ path: stepsOutput, fullPage: false });
console.log(stepsOutput);
await page.evaluate(() => localStorage.removeItem("sugo_auth"));
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.getByText("WORKSPACE GATE").waitFor();
await page.screenshot({ path: loginOutput, fullPage: false });
console.log(loginOutput);
await browser.close();
