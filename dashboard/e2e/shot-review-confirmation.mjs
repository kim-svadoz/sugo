import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { E2E_UI_URL } from "../port-contract.mjs";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const blocker = {
  schemaVersion: 1,
  kind: "review_confirmation",
  sessionId: "plan-review-demo",
  stage: "REVIEW_RUNNING",
  resumeAction: "review_done",
  summary: "검색 필터 조회 조건과 빈 결과 처리를 수정했습니다.",
  question: "이 작업 결과로 review_done을 진행할까요?",
  context: [],
  options: [
    { id: "approve", label: "확인, 진행", impact: "review_done을 완료하고 docs 단계로 진행합니다." },
    { id: "revise", label: "수정 필요", impact: "수정할 내용을 기록하고 code 단계로 돌아갑니다." },
  ],
  blockedNextStep: "review_done 확인 후 docs 단계 진행",
  createdAt: new Date().toISOString(),
  reviewPacket: {
    report: { schemaVersion: 1, kind: "patch", patchVersion: 1, completionGrade: "verified", summary: "빈 결과 방어와 조회 조건을 개선했습니다.", changedFiles: ["src/category.ts"], requirements: [{ id: "빈 결과를 처리한다", covered: true }], designDecisions: [], knownLimitations: [], verification: { test: { command: "npm test", total: 37, passed: 37, failed: 0, state: "pass" }, runtimeVerified: true, wiringVerified: true, validationVerdict: "pass" } },
    files: [{ path: "src/category.ts", change: "modified" }],
    summary: "검색 필터 조회 조건과 빈 결과 처리를 수정했습니다.",
    changes: ["사용자 ID와 필터 목록 조건을 함께 적용했습니다.", "조회 결과는 최대 30개로 제한했습니다."],
    tests: ["FilterServiceTest 37/37 통과", "원본 check의 기존 실패 1건은 별도 표시"],
    designDecisions: ["빈 결과는 캐시하지 않습니다.", "공통 코드는 함수 3줄만 추가했습니다."],
    knownLimitations: ["운영 환경 시뮬레이터는 실행하지 않았습니다."],
  },
};
const spec = {
  id: "spec-review-demo",
  workspace_name: "orders",
  title: "검색 필터 작업 결과",
  status: "in_progress",
  due_date: "2026-10-16",
  project_path: "/workspace/orders-api",
  spec_path: "/workspace/spec.md",
  has_run: true,
  task_count: 1,
  done_task_count: 0,
  active_task_count: 0,
  blocked_task_count: 1,
  stale_task_count: 0,
  unverified_task_count: 0,
  focus_task_id: "task-review-demo",
  focus_task_title: "검색 필터 구현",
  focus_task_status: "blocked",
  focus_task_note: blocker.question,
  focus_task_updated_at: new Date().toISOString(),
  focus_task_blocker_decision: null,
  focus_task_human_blocker: blocker,
};

await page.addInitScript(() => {
  localStorage.setItem("sugo_auth", JSON.stringify({ user: { id: "shotuser" }, accessToken: "fake.jwt.token", refreshToken: null, expiresAt: Date.now() + 3600000 }));
});
await page.route("**/health", (route) => route.fulfill({ json: { status: "ok", version: "0.15.0" } }));
await page.route("**/api/**", (route) => {
  const url = route.request().url();
  if (url.includes("/api/sync/plugin-version")) return route.fulfill({ json: { version: "0.26.0" } });
  if (url.includes("/api/workspaces/schedule")) return route.fulfill({ json: { specs: [spec] } });
  if (url.includes("/api/schedule/commitments")) return route.fulfill({ json: { commitments: [] } });
  if (url.includes("/api/schedule/memos")) return route.fulfill({ json: { memos: [] } });
  if (url.includes("/api/workspaces")) return route.fulfill({ json: { workspaces: [{ name: "orders", projects: [] }] } });
  return route.fulfill({ json: {} });
});

await page.goto(`${E2E_UI_URL}/schedule`, { waitUntil: "networkidle" });
await page.getByText("검색 필터 작업 결과", { exact: true }).first().click();
await page.getByText("작업 결과 확인", { exact: true }).waitFor();
const output = join(tmpdir(), "sugo-review-confirmation.png");
await page.screenshot({ path: output, fullPage: false });
console.log(output);
const reportPromise = page.waitForEvent("popup");
await page.getByRole("button", { name: "리뷰 보고서 HTML로 열기" }).click();
const report = await reportPromise;
await report.waitForLoadState();
await report.getByText("37/37 통과", { exact: true }).first().waitFor();
await report.screenshot({ path: join(tmpdir(), "sugo-review-report.png"), fullPage: true });
console.log(join(tmpdir(), "sugo-review-report.png"));
await browser.close();
