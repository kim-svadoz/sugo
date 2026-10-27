import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.SUGO_UI_URL ?? "http://127.0.0.1:5175";
const output = process.env.SUGO_SCREENSHOT ?? join(tmpdir(), "sugo-integrations.png");
const detailOutput = output.replace(/\.png$/i, "-git.png");
const mappingOutput = output.replace(/\.png$/i, "-mapping.png");
const registrationOutput = output.replace(/\.png$/i, "-registration.png");
const projects = [
  {
    project_path: "/work/catalog-api",
    git_synced: 0,
    aws_synced: 1,
    local_git: { branch: "feature/catalog-search", headCommit: "8a173785", baseCommit: "4a2eef5e", dirty: false },
    remote_git: { remoteUrl: "codecommit::ap-northeast-2://catalog-api", provider: "aws_codecommit", providerLabel: "AWS CodeCommit", repository: "catalog-api" },
    aws_release: null,
    aws_deployments: [{ linkMode: "suggested", accountName: "default", environment: "dev", region: "ap-northeast-2", cluster: "catalog-api", service: "catalog-api", status: "ACTIVE", rolloutState: "COMPLETED", healthState: "HEALTHY", matchSource: "service", taskDefinition: null, revision: 1, runningCount: 1, desiredCount: 1, images: [], deployedAt: null, taskDefinitionRegisteredAt: null, observedAt: null, pinpointApplicationName: null, apmState: null, apmRunningAgents: null, apmAgentCount: null, apmLatestHeartbeatAt: null, apmSampleCount: null, apmErrorCount: null, apmErrorRate: null, apmAverageResponseMs: null, apmP95ResponseMs: null, apmMaxResponseMs: null, apmApdexScore: null, apmSignal: null }],
  },
  {
    project_path: "/work/identity-api",
    git_synced: 0,
    aws_synced: 0,
    local_git: { branch: "main", headCommit: "91b223ac", baseCommit: "91b223ac", dirty: false },
    remote_git: { remoteUrl: "codecommit::ap-northeast-2://identity-api", provider: "aws_codecommit", providerLabel: "AWS CodeCommit", repository: "identity-api" },
    aws_release: null,
    aws_deployments: [],
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.error("pageerror", error));
page.on("console", (message) => { if (message.type() === "error") console.error("console", message.text()); });
await page.addInitScript(() => localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: "shotuser" }, accessToken: "fake.jwt.token", refreshToken: null, expiresAt: Date.now() + 3_600_000 })));
await page.route("**/health", (route) => route.fulfill({ json: { status: "ok", version: "0.42.47", build: "dev" } }));
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (!new URL(url).pathname.startsWith("/api/")) return route.continue();
  if (url.includes("/api/git-connections")) return route.fulfill({ json: { providers: [
    { id: "github", label: "GitHub", pullRequests: true, selfHosted: false, defaultBaseUrl: "https://api.github.com", status: "available", authMode: "token" },
    { id: "gitlab", label: "GitLab", pullRequests: true, selfHosted: true, defaultBaseUrl: "https://gitlab.com", status: "available", authMode: "token" },
    { id: "bitbucket_server", label: "Bitbucket Server / Data Center", pullRequests: true, selfHosted: true, defaultBaseUrl: null, status: "available", authMode: "token" },
    { id: "aws_codecommit", label: "AWS CodeCommit", pullRequests: true, selfHosted: false, defaultBaseUrl: null, status: "available", authMode: "aws_default_chain" },
  ], connections: [] } });
  if (url.includes("/api/aws-context")) return route.fulfill({ json: { connected: true, activeAccount: "default", accounts: [], inventory: [], observedAt: null } });
  if (url.includes("/api/pinpoint-context")) return route.fulfill({ json: { connected: false, applications: [], observedAt: null } });
  if (url.includes("/api/project-integrations")) return route.fulfill({ json: {
    projects: [
      { workspace_name: "catalog", project_path: "/work/catalog-api", configured: true, selections: [{ accountName: "team-dev", environment: "dev", service: "catalog-api-service", cluster: "catalog" }] },
      { workspace_name: "identity", project_path: "/work/identity-api", configured: false, selections: [] },
    ],
    candidates: [
      { accountName: "team-dev", environment: "dev", service: "catalog-api-service", cluster: "catalog", images: ["repo/catalog-api:1"], pinpointApplicationName: "catalog-dev" },
      { accountName: "team-stg", environment: "stg", service: "catalog-api-service", cluster: "catalog", images: ["repo/catalog-api:2"], pinpointApplicationName: "catalog-stg" },
    ],
  } });
  if (url.includes("/api/workspaces")) return route.fulfill({ json: { workspaces: [{ name: "catalog", projects: [projects[0]] }, { name: "identity", projects: [projects[1]] }] } });
  if (url.includes("/api/profile")) return route.fulfill({ json: { profile: { displayName: "개발자" } } });
  if (url.includes("/api/sync/plugin-version")) return route.fulfill({ json: { version: "0.51.48" } });
  return route.fulfill({ json: {} });
});
await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(700);
console.log("page", page.url(), (await page.locator("body").innerText()).slice(0, 500));
await page.getByText("로컬 Git은 준비됐습니다", { exact: true }).waitFor({ timeout: 5_000 });
await page.getByText("AWS CodeCommit 2 · 2개 프로젝트", { exact: true }).waitFor({ timeout: 5_000 });
await page.screenshot({ path: output, fullPage: true });
await page.getByText("프로젝트별 연결", { exact: true }).scrollIntoViewIfNeeded();
await page.screenshot({ path: detailOutput, fullPage: false });
await page.getByRole("button", { name: "프로젝트 매핑" }).click();
await page.getByText("현재 연결됨", { exact: true }).waitFor({ timeout: 5_000 });
await page.waitForTimeout(250);
console.log("active integration tab", await page.locator('nav[aria-label="연동 설정"] button[aria-pressed="true"]').allTextContents());
console.log("integration tab borders", await page.locator('nav[aria-label="연동 설정"] button').evaluateAll((items) => items.map((item) => [item.textContent, item.getAttribute('aria-pressed'), getComputedStyle(item).borderBottomColor])));
await page.screenshot({ path: mappingOutput, fullPage: true });
await page.getByRole("button", { name: "프로젝트 등록" }).first().click();
await page.getByRole("region", { name: "새 프로젝트 등록" }).waitFor({ timeout: 5_000 });
await page.screenshot({ path: registrationOutput, fullPage: true });
console.log(output, detailOutput, mappingOutput, registrationOutput);
await browser.close();
