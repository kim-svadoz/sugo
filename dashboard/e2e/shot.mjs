import { chromium } from "playwright";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// CLAUDE_JOB_DIR이 없으면 OS 임시 디렉터리로 — 문자열 연결로 두면 "undefined/tmp"가 된다.
const OUT = process.env.CLAUDE_JOB_DIR ? join(process.env.CLAUDE_JOB_DIR, "tmp") : tmpdir();
const BASE = "http://localhost:4173";

// 화면에 그대로 찍히는 mock 경로 — 이 PC의 Windows 경로를 박으면 mac 스크린샷에 없는 경로가 뜬다.
const SPLEARN = join(homedir(), "splearn");
const PAYMENTS = join(homedir(), "work", "payments");

const workspaces = [{
  name: "temp-workspace",
  projects: [{ project_path: SPLEARN, git_synced: 1 }],
  taskCounts: { pending: 2, in_progress: 1, done: 3, archived: 0 },
  roadmap: { total: 6, done: 3, active: 1 },
}, {
  name: "payments-api",
  projects: [{ project_path: PAYMENTS, git_synced: 0 }],
  taskCounts: { pending: 0, in_progress: 0, done: 5, archived: 1 },
  roadmap: { total: 5, done: 5, active: 0 },
}];

const roadmapNodes = [
  { id: "spec1", title: "이메일 로그인 스펙", level: "spec", status: "done", depends_on: [], parent: null, ref: null, note: null, spec_path: null, work_result: null, lineage: null, manual_status: null, pos_x: null, pos_y: null },
  { id: "t1", title: "EmailLoginService 구현", level: "task", status: "done", depends_on: ["spec1"], parent: null, ref: null, note: null, spec_path: null, work_result: null, lineage: null, manual_status: null, pos_x: null, pos_y: null },
  { id: "t2", title: "로그인 컨트롤러 배선", level: "task", status: "in_progress", depends_on: ["t1"], parent: null, ref: null, note: null, spec_path: null, work_result: null, lineage: null, manual_status: null, pos_x: null, pos_y: null },
  { id: "t3", title: "통합테스트", level: "task", status: "pending", depends_on: ["t2"], parent: null, ref: null, note: null, spec_path: null, work_result: null, lineage: null, manual_status: "done", pos_x: null, pos_y: null },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.addInitScript(() => {
  localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: "shotuser" }, accessToken: "fake.jwt.token", refreshToken: null, expiresAt: Date.now() + 3600000 }));
});
await page.route("**/health", (r) => r.fulfill({ json: { status: "ok", version: "0.1.0", build: "dev" } }));
await page.route("**/api/**", (route) => {
  const u = route.request().url();
  if (u.includes("/api/sync/plugin-version")) return route.fulfill({ json: { version: "2.81.12" } });
  if (u.includes("/api/workspaces/") && u.includes("/roadmap")) return route.fulfill({ json: { nodes: roadmapNodes } });
  if (u.includes("/api/workspaces")) return route.fulfill({ json: { workspaces } });
  if (u.includes("/api/skills/agents")) return route.fulfill({ json: { agents: ["code-agent", "test-agent", "review-agent", "docs-agent"] } });
  if (u.includes("/api/skills")) return route.fulfill({ json: { skills: ["implement", "bugfix", "refactor", "test-targeted", "review-validate"] } });
  if (u.includes("/api/harness/unified")) return route.fulfill({ body: "# Java · Spring Boot 하네스\n\n## 빌드\n`gradlew build`\n\n## 규칙\n- 컨트롤러는 얇게\n- 서비스에 트랜잭션 경계\n", contentType: "text/markdown" });
  if (u.includes("/api/harness/manifest")) return route.fulfill({ json: { harnesses: [{ id: "lang/java", name: "Java", version: "1.0" }, { id: "framework/spring", name: "Spring Boot", version: "3.x" }] } });
  return route.fulfill({ json: {} });
});

async function shot(path, file) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, file), fullPage: false });
  console.log("shot:", file);
}
await shot("/login", "01-login.png");
await shot("/sessions", "02-sessions.png");
await shot("/roadmap/temp-workspace", "03-roadmap.png");
await shot("/playbook", "04-playbook.png");
await shot("/skills", "05-skills.png");
await shot("/harness", "06-harness.png");
await shot("/settings", "07-settings.png");
await browser.close();
console.log("DONE");
