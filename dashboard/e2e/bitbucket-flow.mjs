// 실제 로그인 토큰(JWT Bearer)으로 Bitbucket PR 전체 플로우를 고정 포트 mock Bitbucket Server에 대고
// 검증한다: PAT 저장(AES-GCM 암호화) → 상태 조회(hint만) → prRefs 심기 → PR 생성(실 HTTP:
// branches 조회/findOpenPr/createPullRequest) → 기존 PR 재조회.
import { chromium } from "playwright";
import { E2E_API_URL, E2E_BITBUCKET_URL, E2E_OIDC_URL, E2E_UI_URL } from "../port-contract.mjs";

const BE = E2E_API_URL;
const BB = E2E_BITBUCKET_URL;
let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : "  << " + JSON.stringify(detail)}`);
  if (!cond) failures++;
};

// 1) 헤드리스 로그인으로 실제 JWT Bearer 획득
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${E2E_UI_URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL((url) => url.origin === E2E_OIDC_URL, { timeout: 10000 });
await page.waitForSelector('input[name="login"]', { timeout: 8000 });
await page.fill('input[name="login"]', "e2euser");
await page.fill('input[name="password"]', "any");
await page.click('button[type="submit"]');
await page.waitForTimeout(800);
const consent = await page.$('button[type="submit"]');
if (consent && page.url().startsWith(E2E_OIDC_URL)) { await consent.click(); await page.waitForTimeout(800); }
await page.waitForURL((url) => url.origin === E2E_UI_URL && /^\/(sessions|roadmap)/.test(url.pathname), { timeout: 12000 }).catch(() => {});
await page.waitForTimeout(800);
const token = await page.evaluate(() => JSON.parse(localStorage.getItem("sugo_auth")).accessToken);
await browser.close();
check("실제 로그인으로 JWT Bearer 획득", (token || "").split(".").length === 3);

const authed = (path, opts = {}) =>
  fetch(BE + path, { ...opts, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(opts.headers || {}) } });

// 2) PAT 저장 (baseUrl = mock Bitbucket)
await authed("/api/bitbucket", { method: "PUT", body: JSON.stringify({ token: "my-secret-pat-1234", baseUrl: BB }) });
const status = await (await authed("/api/bitbucket")).json();
check("PAT 저장 후 connected + hint만(토큰 원문 미노출)", status.connected === true && status.hint === "1234" && !JSON.stringify(status).includes("my-secret-pat"), status);

// 3) prRefs 심기: roadmap 노드의 workResult.prRefs (feat/ 브랜치라 mock이 존재로 응답)
await fetch(BE + "/api/sync/roadmap", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: "e2euser",
    workspaceName: "demo-workspace",
    nodes: [
      { id: "t-1", title: "로그인 기능 구현", level: "task", status: "done",
        workResult: JSON.stringify({ prRefs: { baseUrl: BB, projectKey: "PROJ", repoSlug: "api", sourceBranch: "feat/login", targetBranch: "develop" } }) },
      { id: "t-2", title: "로그아웃 기능", level: "task", status: "pending" },
    ],
  }),
});

// 4) PR 생성 (실 HTTP: remoteBranchExists → findOpenPr(없음) → createPullRequest)
const createRes = await authed("/api/pr/create", { method: "POST", body: JSON.stringify({ workspace: "demo-workspace", nodeId: "t-1", scope: "task", title: "로그인 PR" }) });
const created = await createRes.json();
check("PR 생성 성공(실 Bitbucket HTTP 왕복)", createRes.status === 200 && created.pr?.id >= 101 && !created.existed, { status: createRes.status, created });
check("생성된 PR URL이 mock 응답에서 파싱됨(links.self[0].href)", typeof created.pr?.url === "string" && created.pr.url.includes("/pr/"), created.pr);

// 5) 기존 PR 재조회 → 이제 존재
const existRes = await authed("/api/pr/existing", { method: "POST", body: JSON.stringify({ workspace: "demo-workspace", nodeId: "t-1", scope: "task" }) });
const exist = await existRes.json();
check("existing 재조회 → exists:true", exist.exists === true && exist.pr?.id >= 101, exist);

// 6) 브랜치 미푸시(feat/ 아님) → BRANCH_NOT_PUSHED
await fetch(BE + "/api/sync/roadmap", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "e2euser", workspaceName: "demo-workspace", nodes: [
    { id: "t-2", title: "로그아웃 기능", level: "task", status: "done",
      workResult: JSON.stringify({ prRefs: { baseUrl: BB, projectKey: "PROJ", repoSlug: "api", sourceBranch: "wip/nothere", targetBranch: "develop" } }) },
  ]}),
});
const notPushed = await (await authed("/api/pr/create", { method: "POST", body: JSON.stringify({ workspace: "demo-workspace", nodeId: "t-2", scope: "task" }) })).json();
check("미푸시 브랜치 → BRANCH_NOT_PUSHED", notPushed.error === "BRANCH_NOT_PUSHED", notPushed);

// 7) PAT 삭제
await authed("/api/bitbucket", { method: "DELETE" });
const afterDel = await (await authed("/api/bitbucket")).json();
check("PAT 삭제 후 disconnected", afterDel.connected === false, afterDel);

console.log(`\n결과: ${failures === 0 ? "전부 통과 ✅" : failures + "건 실패 ❌"}`);
process.exit(failures === 0 ? 0 : 1);
