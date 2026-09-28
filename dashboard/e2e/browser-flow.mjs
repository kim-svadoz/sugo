// 헤드리스 Chromium(Playwright)로 실제 브라우저 렌더링 + 실제 OIDC authorization_code 플로우를
// 끝까지 완주 검증한다: 프론트(:4173) → 로그인 게이트 → 실제 OIDC(:9100) 로그인/동의 → /auth/callback
// → 실 토큰 교환(/api/auth/token) → /sessions 실데이터 렌더 → /roadmap 노드/한글 렌더.
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { E2E_OIDC_URL, E2E_UI_URL } from "../port-contract.mjs";

const FRONTEND = E2E_UI_URL;
// 스크린샷 위치는 OS별 임시 디렉터리로 — `/tmp` 하드코딩은 Windows에서 엉뚱한 데로 간다.
const shot = (name) => join(tmpdir(), name);
let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : "  << " + JSON.stringify(detail)}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [browser console.error]", m.text());
});

try {
  // 1) 보호된 루트 접근 → 로그인으로 게이트
  await page.goto(FRONTEND + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  check("보호 라우트가 /login으로 게이트", page.url().includes("/login"), page.url());
  const signInVisible = await page.getByRole("button", { name: /sign in/i }).isVisible().catch(() => false);
  check("로그인 페이지 렌더(Sign in 버튼)", signInVisible);

  // 2) Sign in 클릭 → 실제 OIDC provider로 리다이렉트
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => url.origin === E2E_OIDC_URL, { timeout: 10000 });
  check("실제 OIDC provider로 리다이렉트", page.url().startsWith(E2E_OIDC_URL), page.url());

  // 3) OIDC dev 로그인 화면: login=e2euser, password 아무거나
  await page.waitForSelector('input[name="login"], input[name="username"]', { timeout: 10000 });
  const loginSel = (await page.$('input[name="login"]')) ? 'input[name="login"]' : 'input[name="username"]';
  await page.fill(loginSel, "e2euser");
  await page.fill('input[name="password"]', "any-password");
  await page.click('button[type="submit"], button:has-text("Sign-in"), button:has-text("Continue")');
  await page.waitForTimeout(1000);

  // 4) 동의(consent) 화면이 있으면 승인
  const consentBtn = await page.$('button[type="submit"]');
  if (consentBtn && page.url().startsWith(E2E_OIDC_URL)) {
    await consentBtn.click();
    await page.waitForTimeout(1000);
  }

  // 5) 콜백 → 토큰 교환 → 앱 내부로. /sessions로 착지할 때까지 대기
  await page.waitForURL((url) => url.origin === E2E_UI_URL && /^\/(sessions|roadmap)/.test(url.pathname), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check("실 토큰 교환 후 앱 내부(/sessions)로 진입", page.url().startsWith(E2E_UI_URL) && /\/(sessions|roadmap)/.test(new URL(page.url()).pathname), page.url());

  // 6) Sessions에 실데이터(워크스페이스 카드) 렌더
  const bodyText = await page.textContent("body");
  check("워크스페이스 카드(demo-domain) 렌더", bodyText.includes("demo-domain"), bodyText?.slice(0, 200));
  check("Canvas Progress 표시", /Canvas Progress/i.test(bodyText), null);

  // 7) 워크스페이스 클릭 → Roadmap 페이지 + 한글 노드 렌더
  await page.getByText("demo-domain").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const roadmapText = await page.textContent("body");
  check("Roadmap 페이지에 한글 노드 렌더(로그인 기능 구현)", roadmapText.includes("로그인 기능 구현"), page.url());

  // 8) localStorage에 실제 토큰이 저장됐는지(auth 상태)
  const auth = await page.evaluate(() => localStorage.getItem("sugo_auth"));
  const parsed = auth ? JSON.parse(auth) : null;
  check("localStorage에 실 access token 저장 + userId=e2euser", parsed?.user?.id === "e2euser" && !!parsed?.accessToken, parsed?.user);

  await page.screenshot({ path: shot("e2e-sessions.png") }).catch(() => {});
} catch (err) {
  console.log("✗ 예외:", err.message);
  failures++;
  await page.screenshot({ path: shot("e2e-error.png") }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n결과: ${failures === 0 ? "전부 통과 ✅" : failures + "건 실패 ❌"}`);
process.exit(failures === 0 ? 0 : 1);
