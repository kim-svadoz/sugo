import { chromium } from "playwright";
import assert from "node:assert/strict";
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
  { id: "spec-rd20", workspace_name: "orders", title: "쇼핑히스토리 rd20 개편", status: "in_progress", due_date: plus(3), project_path: "/home/u1/projects/orders-api" },
  { id: "spec-favorite-items", workspace_name: "orders", title: "관심 상품 추천", status: "pending", due_date: plus(3), project_path: null },
  { id: "spec-overdue", workspace_name: "orders", title: "지난 마감(테스트)", status: "in_progress", due_date: minus(2), project_path: null },
  { id: "spec-profile", workspace_name: "profile", title: "프로필 API v2 마이그레이션", status: "pending", due_date: plus(10), project_path: null },
  { id: "spec-manual-abc123", workspace_name: "inventory", title: "sugo 릴리스 체크리스트 정리", status: "pending", due_date: null, project_path: null },
  // 오늘 달력에는 안 보이는 먼 미래 마감(전체 목록 토글 + 클릭 시 마감월로 점프하는지 확인용).
  { id: "spec-far-future", workspace_name: "orders", title: "다음다음달 큰 개편", status: "pending", due_date: plus(70), project_path: "/home/u1/projects/orders-api" },
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
          { name: "orders", projects: [{ project_path: "/home/u1/projects/orders-api", git_synced: 1 }, { project_path: "/home/u1/projects/shop-batch", git_synced: 0 }], taskCounts: {}, roadmap: {}, roadmapCount: 0, roadmapDoneCount: 0, activeTaskCount: 0, historyCount: 0, decisionCount: 0, checkpointCount: 0, projectCount: 0, lastActivityAt: null },
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
        // 페이지네이션(5개씩) + 마크다운 미리보기 확인용으로 6개, created_at 오름차순.
        // learned_from(마크다운)과 checklist(git/ 카테고리처럼 목록만 있는 것) 둘 다
        // .md-body-compact로 같은 크기로 렌더링되는지 확인용으로 섞어 넣는다.
        checkpoints: [
          ...Array.from({ length: 5 }, (_, i) => ({
            id: `CP-mock${i}`,
            category: "general",
            title: `체크포인트 ${i + 1}`,
            learned_from: i === 0 ? "## 핵심 규칙\n\n- **커밋 전**에는 항상 `npm test`를 돌린다.\n- PR은 리뷰어 1인 이상 승인 필요.\n\n> 회귀를 놓치면 롤백 비용이 훨씬 크다." : `체크포인트 ${i + 1}의 내용`,
            checklist: [],
            applies_to: [],
            checkpoint_date: null,
            expires_at: i === 0 ? minus(1) : i === 1 ? plus(2) : null,
            created_at: `2026-09-${10 + i}T00:00:00.000Z`,
          })),
          {
            id: "CP-mock-git",
            category: "git",
            title: "기준 브랜치는 develop",
            learned_from: null,
            checklist: ["작업 브랜치를 develop에서 분기했는지 확인", "PR 대상 브랜치가 develop인지 확인"],
            applies_to: [],
            checkpoint_date: null,
            expires_at: null,
            created_at: "2026-09-16T00:00:00.000Z",
          },
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

// 칩 클릭 → 상세 패널. spec-favorite-items은 project_path=null이라 체크포인트 버튼이 비활성이어야 한다.
await page.getByText("관심 상품 추천", { exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "schedule-02-detail-no-project.png"), fullPage: false });

// 제목 옆 연필 → 인라인 입력으로 바뀌는지 확인
await page.locator('button[title^="이름 변경"]').click();
await page.waitForTimeout(150);
await page.screenshot({ path: join(OUT, "schedule-02b-title-editing.png"), fullPage: false });
await page.locator("input").first().fill("이름 바꾼 관심 상품");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-02c-title-renamed-saved-flash.png"), fullPage: false });

// DatePicker 팝오버 열기 → 선택 → "저장됨" 플래시 확인
await page.locator(`button:has-text('${specs[1].due_date}')`).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-03-datepicker-open.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(1700); // savedFlash 자동소멸(1.6s) 이후 상태로 정리

// 대상 프로젝트 지정 → 즉시 저장("저장됨" 플래시) + 체크포인트 버튼이 활성화되며 라벨이 바뀐다.
await page.locator("select").first().selectOption("/home/u1/projects/orders-api");
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-04-project-assigned-saved-flash.png"), fullPage: false });

// 이제 활성화된 프로젝트 체크포인트 버튼 → Schedule 위에 겹쳐 뜨는지(리다이렉트 아님) 확인
await page.getByText("orders-api 프로젝트 체크포인트", { exact: true }).click();
await page.waitForTimeout(400);
assert.equal(await page.locator('input[type="date"]').last().inputValue(), plus(3), "SPEC 체크포인트는 마감일을 기본 유효일로 사용해야 한다");
assert.equal(await page.getByText("만료됨", { exact: true }).count(), 1, "만료 체크포인트 배지가 보여야 한다");
assert.equal(await page.getByText("곧 만료", { exact: true }).count(), 1, "임박 체크포인트 배지가 보여야 한다");
await page.screenshot({ path: join(OUT, "schedule-05-checkpoint-overlay.png"), fullPage: false });

// 6개라 페이지네이션(5개씩)이 뜬다 → 다음 페이지
await page.getByText("다음 →", { exact: true }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "schedule-05b-checkpoint-page2.png"), fullPage: false });

// 새 체크포인트 작성 → 미리보기 탭
await page.getByPlaceholder("제목", { exact: true }).fill("마크다운 미리보기 테스트");
await page.getByPlaceholder(/Markdown 문법으로/).fill("## 제목\n\n- 목록 1\n- 목록 2\n\n**굵게** 확인");
await page.getByText("미리보기", { exact: true }).last().click();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "schedule-05c-new-checkpoint-preview.png"), fullPage: false });

await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Canvas에서 보기 → Schedule 위에 캔버스 오버레이(리다이렉트 아님), Esc로 Schedule 복귀 확인
await page.getByText("Canvas에서 보기", { exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, "schedule-06-canvas-overlay.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-07-back-to-schedule.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// 이미 project_path가 실려온(실제 프로젝트 sync 유래) spec-rd20 — 별도 조작 없이도 라벨이 맞는지.
await page.getByText("쇼핑히스토리 rd20 개편", { exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "schedule-08-detail-preassigned-project.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// SPEC 일정 추가 — 워크스페이스 선택 후 프로젝트 2단계 선택 플로우
await page.getByText("SPEC 일정 추가", { exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-09-add-spec-modal.png"), fullPage: false });
await page.locator("select").first().selectOption("orders");
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "schedule-10-add-spec-project-picker.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// 왼쪽 패널 "등록완료" 토글(마감일이 잡힌 것만) — 마감월이 지금 보이는 달을 벗어난
// spec-far-future도 목록엔 보이고, 기한 미정(project-draft)은 안 보여야 한다.
await page.getByRole("button", { name: /^등록완료 ·/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "schedule-11-scheduled-toggle.png"), fullPage: false });

// 그 카드를 클릭하면 캘린더가 마감월로 점프해야 한다(오늘 달이 아니었던 걸 확인).
await page.getByText("다음다음달 큰 개편", { exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "schedule-12-jump-to-due-month.png"), fullPage: false });

await browser.close();
console.log("DONE");
