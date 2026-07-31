import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/localhost:9100/, { timeout: 10000 });
await page.waitForSelector('input[name="login"]', { timeout: 8000 });
await page.fill('input[name="login"]', "e2euser");
await page.fill('input[name="password"]', "any");
await page.click('button[type="submit"]');
await page.waitForTimeout(800);
const c = await page.$('button[type="submit"]');
if (c && page.url().includes("9100")) { await c.click(); await page.waitForTimeout(800); }
await page.waitForURL(/localhost:4173\/(sessions|roadmap)/, { timeout: 12000 }).catch(()=>{});
await page.waitForTimeout(1000);
const token = await page.evaluate(() => { const a = localStorage.getItem("sugo_auth"); return a ? JSON.parse(a).accessToken : null; });
const parts = (token||"").split(".");
console.log("access token format:", parts.length === 3 ? "JWT (3 parts)" : `opaque/other (${parts.length} parts)`);
// auth-gated 라우트가 이 토큰을 받는지
const res = await page.evaluate(async (t) => {
  const r = await fetch("http://localhost:4000/api/bitbucket", { headers: { Authorization: "Bearer " + t } });
  return { status: r.status, body: await r.text() };
}, token);
console.log("GET /api/bitbucket with access token →", res.status, res.body.slice(0,120));
await browser.close();
