import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.SUGO_UI_URL ?? "http://127.0.0.1:5175";
const output = process.env.SUGO_SCREENSHOT ?? join(tmpdir(), "sugo-integrations.png");
const mappingOutput = output.replace(/\.png$/i, "-mapping.png");
const registrationOutput = output.replace(/\.png$/i, "-registration.png");
const overviewOutput = output.replace(/\.png$/i, "-overview.png");
const prOutput = output.replace(/\.png$/i, "-pr-scope.png");
const collapsedOutput = output.replace(/\.png$/i, "-sidebar-collapsed.png");
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
  if (url.includes("/api/tokens")) return route.fulfill({ json: { tokens: [] } });
  if (url.includes("/api/git-connections")) return route.fulfill({ json: { providers: [
    { id: "github", label: "GitHub", pullRequests: true, selfHosted: false, defaultBaseUrl: "https://api.github.com", status: "available", authMode: "token" },
    { id: "gitlab", label: "GitLab", pullRequests: true, selfHosted: true, defaultBaseUrl: "https://gitlab.com", status: "available", authMode: "token" },
    { id: "bitbucket_server", label: "Bitbucket Server / Data Center", pullRequests: true, selfHosted: true, defaultBaseUrl: null, status: "available", authMode: "token" },
    { id: "aws_codecommit", label: "AWS CodeCommit", pullRequests: true, selfHosted: false, defaultBaseUrl: null, status: "available", authMode: "aws_default_chain" },
  ], connections: [] } });
  if (url.includes("/api/aws-context")) return route.fulfill({ json: { connected: true, activeAccount: "default", accounts: [{ name: "default", profile: "default", region: "ap-northeast-2", accountHint: "1234", principal: "developer" }], inventory: [], observedAt: null } });
  if (url.includes("/api/pinpoint-context")) return route.fulfill({ json: { connected: false, applications: [], observedAt: null } });
  if (url.includes("/api/project-integrations/select-directory")) return route.fulfill({ json: { supported: false, cancelled: true } });
  if (url.includes("/api/project-integrations/browse")) return route.fulfill({ json: {
    path: "/Users/demo/dev",
    parentPath: "/Users/demo",
    name: "dev",
    projectLike: false,
    signals: [],
    directories: [
      { name: "catalog-api", path: "/Users/demo/dev/catalog-api", projectLike: true, signals: ["package.json"] },
      { name: "notes", path: "/Users/demo/dev/notes", projectLike: false, signals: [] },
    ],
  } });
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
await page.screenshot({ path: output, fullPage: true });
await page.getByRole("button", { name: /외부 서비스 인증·서비스 매핑/ }).click();
await page.getByRole("button", { name: "서비스 상태 연동" }).click();
await page.getByRole("heading", { name: "서비스 상태 연동" }).waitFor({ timeout: 5_000 });
await page.waitForTimeout(250);
await page.locator("#integration-projects").screenshot({ path: mappingOutput });
await page.getByRole("button", { name: /프로젝트 로컬 프로젝트 등록/ }).click();
await page.getByRole("region", { name: "새 프로젝트 등록" }).waitFor({ timeout: 5_000 });
await page.getByRole("button", { name: /폴더를 선택하세요 폴더 선택/ }).click();
await page.getByRole("region", { name: "프로젝트 폴더 선택" }).waitFor({ timeout: 5_000 });
await page.screenshot({ path: registrationOutput, fullPage: true });
await page.getByRole("button", { name: /연결 현황 읽기 전용 결과/ }).click();
await page.getByRole("heading", { name: "프로젝트 연결 현황" }).waitFor({ timeout: 5_000 });
await page.locator('[aria-label="프로젝트별 저장소 연결"]').screenshot({ path: overviewOutput });
await page.getByRole("button", { name: /외부 서비스 인증·서비스 매핑/ }).click();
await page.getByRole("button", { name: "PR 연동" }).click();
await page.getByRole("button", { name: /AWS CodeCommit/ }).click();
await page.getByText("적용 프로젝트 선택").waitFor({ timeout: 5_000 });
await page.screenshot({ path: prOutput, fullPage: true });
await page.getByRole("button", { name: "사이드바 접기" }).click();
await page.waitForTimeout(250);
await page.screenshot({ path: collapsedOutput, fullPage: true });
console.log(output, mappingOutput, registrationOutput, overviewOutput, prOutput, collapsedOutput);
await browser.close();
