import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";

// §7B Schedule 탭 자체 확인용 — shot.mjs와 같은 mock 패턴(실 백엔드 없이 API 라우트만 가짜로 채운다).
const OUT = process.env.CLAUDE_JOB_DIR ? join(process.env.CLAUDE_JOB_DIR, "tmp") : tmpdir();
const BASE = "http://localhost:4173";

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const minus = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };

const specs = [
  { id: "spec-rd20", workspace_name: "orders", title: "쇼핑히스토리 rd20 개편", status: "in_progress", due_date: plus(3) },
  { id: "spec-favorite-items", workspace_name: "orders", title: "관심 상품 추천", status: "pending", due_date: plus(3) },
  { id: "spec-overdue", workspace_name: "orders", title: "지난 마감(테스트)", status: "in_progress", due_date: minus(2) },
  { id: "spec-profile", workspace_name: "profile", title: "프로필 API v2 마이그레이션", status: "pending", due_date: plus(10) },
  { id: "spec-manual-abc123", workspace_name: "inventory", title: "sugo 릴리스 체크리스트 정리", status: "pending", due_date: null },
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
  if (u.includes("/api/workspaces/schedule")) return route.fulfill({ json: { specs } });
  if (u.includes("/api/workspaces") && u.endsWith("/api/workspaces?userId=shotuser")) {
    return route.fulfill({
      json: {
        workspaces: [
          { name: "orders", projects: [], taskCounts: {}, roadmap: {}, roadmapCount: 0, roadmapDoneCount: 0, activeTaskCount: 0, historyCount: 0, decisionCount: 0, checkpointCount: 0, projectCount: 0, lastActivityAt: null },
          { name: "profile", projects: [], taskCounts: {}, roadmap: {}, roadmapCount: 0, roadmapDoneCount: 0, activeTaskCount: 0, historyCount: 0, decisionCount: 0, checkpointCount: 0, projectCount: 0, lastActivityAt: null },
          { name: "inventory", projects: [], taskCounts: {}, roadmap: {}, roadmapCount: 0, roadmapDoneCount: 0, activeTaskCount: 0, historyCount: 0, decisionCount: 0, checkpointCount: 0, projectCount: 0, lastActivityAt: null },
        ],
      },
    });
  }
  if (u.includes("/api/skills")) return route.fulfill({ json: { skills: [] } });
  if (u.includes("/api/workspaces/") && u.includes("/checkpoints")) {
    return route.fulfill({
      json: {
        checkpoints: [
          { id: "CP-a1b2c3d4", category: "general", title: "PR 전에 회귀 테스트 돌리기", learned_from: "커밋 전에는 항상 npm test를 돌린다.", checklist: [], applies_to: [], checkpoint_date: null },
        ],
      },
    });
  }
  if (u.includes("/api/workspaces/") && u.includes("/roadmap")) {
    return route.fulfill({
      json: {
        nodes: [
          { id: "spec-favorite-items", title: "관심 상품 추천", level: "spec", status: "pending", depends_on: [], parent: null, ref: null, note: null, spec_path: null, work_result: null, lineage: null, manual_status: null, pos_x: null, pos_y: null },
          { id: "run-spec-favorite-items", title: "관심 상품 추천", level: "workstream", status: "pending", depends_on: [], parent: "spec-favorite-items", ref: null, note: null, spec_path: null, work_result: null, lineage: null, manual_status: null, pos_x: null, pos_y: null },
        ],
        counts: { total: 2, pending: 2, in_progress: 0, done: 0, blocked: 0, dropped: 0 },
        issues: [],
      },
    });
  }
  return route.fulfill({ json: {} });
});

async function shot(path, file) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, file), fullPage: false });
  console.log("shot:", file);
}

await shot("/schedule", "schedule-01-calendar.png");

// 칩 클릭 → 상세 패널 (새 DatePicker 버튼 확인)
await page.getByText("관심 상품 추천", { exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "schedule-02-detail-panel.png"), fullPage: false });

// DatePicker 팝오버 열기
await page.locator("button:has-text('2026-09-26')").first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-03-datepicker-open.png"), fullPage: false });
await page.keyboard.press("Escape");

// 체크포인트 관리 → Schedule 위에 겹쳐 뜨는지(리다이렉트 아님) 확인
await page.getByText("체크포인트 관리", { exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "schedule-04-checkpoint-overlay.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Canvas에서 보기 → Schedule 위에 캔버스 오버레이(리다이렉트 아님), Esc로 Schedule 복귀 확인
await page.getByText("Canvas에서 보기", { exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, "schedule-05-canvas-overlay.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-06-back-to-schedule.png"), fullPage: false });

await browser.close();
console.log("DONE");
