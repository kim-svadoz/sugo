/**
 * CommandPalette 단축키 실동작 확인.
 *
 * 백엔드/DB 없이 프론트 preview(:4173)만 띄우고 API는 전부 page.route로 mock한다
 * (shot.mjs와 같은 방식). 키보드 동작은 "조용히 안 먹는" 대표 케이스라 단정 대신 실제
 * 브라우저로 확인한다.
 *
 * 실행: 프론트를 빌드해 :4173에 preview로 띄운 뒤  node shortcut-check.mjs
 */
import { chromium } from "playwright";
import { E2E_UI_URL } from "../port-contract.mjs";

const BASE = E2E_UI_URL;
// Playwright의 `ControlOrMeta`가 호스트에 맞춰 macOS면 Meta, 그 외엔 Control을 보낸다 —
// 직접 process.platform으로 갈래를 치지 않는다(그러면 이식성 가드에도 걸리고, 갈래마다
// 검증이 반쪽이 된다). 앱 코드는 metaKey || ctrlKey를 둘 다 받는다.
const MOD = "ControlOrMeta";

let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  << " + JSON.stringify(detail)}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.addInitScript(() => {
  localStorage.setItem(
    "sugo_auth",
    JSON.stringify({ user: { id: "shortcutuser" }, accessToken: "fake.jwt.token", refreshToken: null, expiresAt: Date.now() + 3600000 }),
  );
});
await page.route("**/health", (r) => r.fulfill({ json: { status: "ok", version: "0.1.0", build: "dev" } }));
await page.route("**/api/**", (route) => {
  const u = route.request().url();
  if (u.includes("/api/sync/plugin-version")) return route.fulfill({ json: { version: "0.1.0" } });
  if (u.includes("/api/workspaces")) return route.fulfill({ json: { workspaces: [] } });
  if (u.includes("/api/skills/agents")) return route.fulfill({ json: { agents: [] } });
  if (u.includes("/api/skills")) return route.fulfill({ json: { skills: [] } });
  return route.fulfill({ json: {} });
});

try {
  await page.goto(`${BASE}/sessions`, { waitUntil: "networkidle" });
  check("앱 진입(/sessions)", page.url().includes("/sessions"), page.url());

  // ── ⌘S → /skills
  await page.keyboard.press(`${MOD}+s`);
  await page.waitForURL(/\/skills/, { timeout: 5000 }).catch(() => {});
  check("⌘S(Ctrl+S)로 /skills 이동", /\/skills/.test(page.url()), page.url());

  // ── ⌘P → /playbook
  await page.keyboard.press(`${MOD}+p`);
  await page.waitForURL(/\/playbook/, { timeout: 5000 }).catch(() => {});
  check("⌘P(Ctrl+P)로 /playbook 이동", /\/playbook/.test(page.url()), page.url());

  // ── ⌘K로 팔레트를 열고, 힌트가 실제 동작하는 것만 남았는지 확인
  await page.keyboard.press(`${MOD}+k`);
  await page.waitForTimeout(400);
  // 팔레트 행은 `<li><button><span>{label}</span>{hint && <kbd>{hint}</kbd>}…`.
  // 라벨과 힌트가 서로 다른 엘리먼트라 innerText 한 줄로는 안 잡힌다 — kbd 유무로 본다.
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("li")]
      .map((li) => ({
        label: li.querySelector("span")?.textContent?.trim() ?? "",
        hint: li.querySelector("kbd")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      }))
      .filter((r) => r.label),
  );
  const hintOf = (label) => rows.find((r) => r.label === label)?.hint ?? null;
  const has = (label) => rows.some((r) => r.label === label);

  // 밑에 깔린 페이지에도 <li>가 있으므로(Playbook의 번호 스텝 등) 총 개수가 아니라
  // 팔레트 명령 6개가 다 있는지로 본다.
  const expected = ["Workspaces", "Skills", "Harness", "Playbook", "Settings", "데이터 새로고침"];
  check("팔레트 명령 6개가 모두 렌더된다", expected.every(has), JSON.stringify(rows));
  check("Workspaces 행이 있고 ⌘ 힌트는 없다", has("Workspaces") && hintOf("Workspaces") === null, JSON.stringify(rows));
  check("Harness 행이 있고 ⌘ 힌트는 없다", has("Harness") && hintOf("Harness") === null, JSON.stringify(rows));
  check("Skills에 ⌘ S 힌트", hintOf("Skills") === "⌘ S", hintOf("Skills"));
  check("Playbook에 ⌘ P 힌트", hintOf("Playbook") === "⌘ P", hintOf("Playbook"));
  check("데이터 새로고침에 ⌘ R 힌트", hintOf("데이터 새로고침") === "⌘ R", hintOf("데이터 새로고침"));

  // 화면 전체에 남은 ⌘ 힌트가 실제 동작하는 3개(S/P/R)뿐인지
  const hints = await page.evaluate(() =>
    [...document.body.innerText.matchAll(/⌘\s*([A-Za-z])/g)].map((m) => m[1].toUpperCase()).sort(),
  );
  check("팔레트에 남은 단축키 힌트는 S/P/R뿐", JSON.stringify([...new Set(hints)]) === JSON.stringify(["P", "R", "S"]), hints);
} catch (err) {
  check("실행", false, String(err));
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? "단축키 확인 전부 통과 ✅" : failures + "건 실패 ❌"}`);
process.exit(failures === 0 ? 0 : 1);
