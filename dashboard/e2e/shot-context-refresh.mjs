import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (message) => console.log("browser:", message.type(), message.text()));
page.on("pageerror", (error) => console.log("pageerror:", error.message));
await page.addInitScript(() => localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: "shot" }, accessToken: "token", expiresAt: Date.now() + 3600000 })));
await page.route("**/health", (route) => route.fulfill({ json: { status: "ok", version: "0.29.9" } }));
await page.route("http://localhost:3001/api/**", (route) => {
  const url = route.request().url();
  if (url.includes("/api/aws-context")) return route.fulfill({ json: {
    connected: true, activeAccount: "dev", accounts: [{ name: "dev", profile: "dev", region: "ap-northeast-2", accountHint: "1234", principal: "developer" }],
    observedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(), inventory: [], refreshBudget: { remainingToday: 3, dailyLimit: 4, nextAllowedAt: null, timezone: "Asia/Seoul" },
  } });
  if (url.includes("/api/pinpoint-context")) return route.fulfill({ json: { connected: true, baseUrl: "https://pinpoint.example.com", applications: [], observedAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString() } });
  if (url.includes("/api/aws-guard-policy")) return route.fulfill({ json: { directReadEnabled: false, sessionLimit: 30, dailyLimit: 200, minuteLimit: 10 } });
  if (url.includes("/api/project-integrations")) return route.fulfill({ json: { projects: [], candidates: [] } });
  if (url.includes("/api/git-connections")) return route.fulfill({ json: { connections: [], providers: [] } });
  if (url.includes("/api/tokens")) return route.fulfill({ json: { tokens: [] } });
  return route.fulfill({ json: {} });
});
console.log("open settings");
const response = await page.goto("http://127.0.0.1:5175/settings", { waitUntil: "domcontentloaded", timeout: 10_000 });
console.log("settings loaded");
await page.waitForTimeout(1000);
console.log("status", response?.status(), "title", await page.title(), "body", (await page.locator("body").innerText()).slice(0, 500));
await page.screenshot({ path: join(tmpdir(), "sugo-context-refresh-settings.png"), fullPage: true });
await page.getByText("Pinpoint APM", { exact: true }).scrollIntoViewIfNeeded();
await page.screenshot({ path: join(tmpdir(), "sugo-context-refresh-pinpoint.png"), fullPage: false });
await browser.close();
