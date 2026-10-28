import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.SUGO_UI_URL ?? "http://127.0.0.1:5175";
const output = process.env.SUGO_SCREENSHOT ?? join(tmpdir(), "sugo-new-user-playbook-guide.png");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.addInitScript(() => {
  localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: "new-user" }, accessToken: "fake.jwt.token", refreshToken: null, expiresAt: Date.now() + 3_600_000 }));
  localStorage.setItem("sugo_weather_region", "seoul-cityhall");
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
await page.getByText("첫 파이프라인은 Playbook과 함께 시작해보세요.").waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: output, fullPage: false });
console.log(output);
await browser.close();
