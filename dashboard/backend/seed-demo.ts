/**
 * 로컬 데모 시드 — sqlite(./local.db)에 전체 시나리오 데이터를 넣는다.
 * 실행: npx tsx seed-demo.ts   (백엔드가 꺼져있거나 mysql 모드일 때 안전 — local.db 직접 씀)
 * userId는 실제 로그인 계정(github:58545240)으로 넣어야 대시보드에서 보인다.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSqliteClient } from "./src/db/sqliteClient.js";
import {
  syncUser,
  syncWorkspace,
  syncTask,
  syncHistory,
  syncDecision,
  syncCheckpoint,
  syncWorkspaceMeta,
  syncRoadmap,
} from "./src/services/syncService.js";

const USER = "github:58545240";
// 데모 프로젝트 경로는 화면에 그대로 찍힌다 — 이 PC의 Windows 경로를 박으면 mac에서 시드했을 때
// 존재하지도 않는 경로가 대시보드에 뜬다(dev-local.mts와 같은 이유로 정정).
const SPLEARN = join(homedir(), "splearn");
const PAYMENTS = join(homedir(), "work", "payments");
const db = createSqliteClient("./local.db");

const workResult = (over: Record<string, unknown> = {}) => ({
  startedAt: "2026-07-20T09:00:00.000Z",
  endedAt: "2026-07-20T11:30:00.000Z",
  model: "claude-opus-4-8",
  summary:
    "## 배경\n이메일/비밀번호 로그인이 없어 사용자가 진입하지 못했다.\n\n## 변경\n`EmailLoginService`를 추가하고 컨트롤러에 배선했다. 비밀번호는 bcrypt 해시.\n\n## 설계\n기존 인증 흐름을 재사용, 세션 발급은 JWT.\n\n## 테스트\n단위 12 + 통합 2, 전부 그린.",
  files: [
    { path: "src/main/java/auth/EmailLoginService.java", change: "added", diff: "+public class EmailLoginService {\n+  // ...\n+}" },
    { path: "src/main/java/auth/LoginController.java", change: "modified", diff: "@@\n-  // TODO\n+  loginService.login(req);" },
    { path: "src/test/java/auth/EmailLoginServiceTest.java", change: "added" },
  ],
  runtimeVerified: true,
  wiringVerified: true,
  seed: undefined,
  patchVersion: 0,
  ...over,
});

const lineage = (entries: Record<string, unknown>[]) => entries;

async function main() {
  await db.execScript(readFileSync(join("test", "schema.sqlite.sql"), "utf8"));

  await syncUser(db, { userId: USER, displayName: "김성현" });

  // ── 워크스페이스 2개 ─────────────────────────────────────────────
  await syncWorkspace(db, { userId: USER, name: "temp-workspace", projects: [SPLEARN], gitSyncedProjects: [SPLEARN] });
  await syncWorkspace(db, { userId: USER, name: "payments-api", projects: [PAYMENTS], gitSyncedProjects: [] });
  await syncWorkspaceMeta(db, { userId: USER, workspaceName: "temp-workspace", goldenRule: "테스트 먼저, 게이트는 실행증거로만 통과", checkpointsVersion: 3 });

  // ── temp-workspace 태스크 ────────────────────────────────────────
  const tasks: [string, string, "pending" | "in_progress" | "done" | "archived"][] = [
    ["t1", "EmailLoginService 구현", "done"],
    ["t2", "로그인 컨트롤러 배선", "in_progress"],
    ["t3", "통합테스트", "pending"],
    ["t4", "비밀번호 재설정", "done"],
    ["t5", "레거시 인증 정리", "archived"],
  ];
  for (const [id, title, status] of tasks) {
    await syncTask(db, { userId: USER, workspaceName: "temp-workspace", id, title, project: SPLEARN, status });
  }

  // ── Roadmap (DAG: spec → workstream → tasks, work_result/lineage/prRefs) ──
  await syncRoadmap(db, USER, "temp-workspace", [
    { id: "spec1", title: "이메일 로그인 스펙", level: "spec", status: "done", dependsOn: [], parent: null, specPath: "sugo/features/login/prd.md" },
    { id: "ws1", title: "로그인 워크스트림", level: "workstream", status: "in_progress", dependsOn: [], parent: null },
    { id: "t1", title: "EmailLoginService 구현", level: "task", status: "done", dependsOn: ["spec1"], parent: "ws1", ref: "work-result.md", workResult: workResult(), lineage: lineage([{ version: 0, completedAt: "2026-07-20T11:30:00.000Z", commitType: "feat", title: "이메일 로그인", summary: "최초 구현", changedFiles: ["EmailLoginService.java", "LoginController.java"], runtimeVerified: true, wiringVerified: true }]) },
    { id: "t2", title: "로그인 컨트롤러 배선", level: "task", status: "in_progress", dependsOn: ["t1"], parent: "ws1", workResult: workResult({ endedAt: undefined, runtimeVerified: false, wiringVerified: false }) },
    { id: "t3", title: "통합테스트", level: "task", status: "pending", dependsOn: ["t2"], parent: "ws1" },
    { id: "t4", title: "비밀번호 재설정", level: "task", status: "done", dependsOn: [], parent: null, ref: "work-result-v2.md",
      workResult: workResult({ model: "claude-sonnet-5", patchVersion: 1, seed: "소셜 로그인도 지원", prRefs: { status: "OK", branch: "feature/pw-reset", prUrl: "https://bitbucket.example.com/projects/X/repos/y/pull-requests/42", prId: 42 } }),
      lineage: lineage([
        { version: 0, completedAt: "2026-07-18T10:00:00.000Z", commitType: "feat", title: "비밀번호 재설정 초안", summary: "이메일 링크 방식", changedFiles: ["PwResetService.java"], runtimeVerified: true, wiringVerified: true },
        { version: 1, completedAt: "2026-07-19T14:00:00.000Z", commitType: "patch", title: "소셜 로그인 연동", summary: "OAuth 추가", seed: "소셜 로그인도 지원", changedFiles: ["OauthService.java"], runtimeVerified: true, wiringVerified: true },
      ]) },
    { id: "t5", title: "레거시 인증 정리", level: "task", status: "dropped", dependsOn: [], parent: null, note: "범위 밖으로 판단해 드롭" },
  ]);

  // 대시보드 소유 필드(수동 상태/위치)는 sync가 안 건드리므로 직접 세팅해 데모.
  await db.exec("UPDATE sugo_roadmap_nodes SET manual_status = 'done', manual_by = 'dashboard' WHERE user_id = ? AND workspace_name = ? AND id = 't3'", [USER, "temp-workspace"]);

  // payments-api: 완료 워크스페이스
  await syncRoadmap(db, USER, "payments-api", [
    { id: "p1", title: "결제 요청 API", level: "task", status: "done", dependsOn: [] },
    { id: "p2", title: "웹훅 검증", level: "task", status: "done", dependsOn: ["p1"] },
    { id: "p3", title: "정산 배치", level: "task", status: "done", dependsOn: ["p2"] },
  ]);

  // ── History (calibrated-ratio용 표본 ≥10 + 실 데이터) ────────────
  for (let i = 0; i < 12; i++) {
    await syncHistory(db, {
      userId: USER, workspaceName: "temp-workspace", id: `h${i}`,
      taskTitle: i % 2 ? "로그인 컨트롤러 배선" : "EmailLoginService 구현",
      summary: `작업 ${i}: 기능 구현 및 검증 완료`,
      keyDecisions: ["JWT 채택", "bcrypt 해시"],
      filesChanged: [{ path: "EmailLoginService.java", change: "added" }],
      estimatedHumanHours: 3 + (i % 3),
      aiExecutionMinutes: 40 + i * 3,
    });
  }

  // ── Decisions (ADR) ─────────────────────────────────────────────
  await syncDecision(db, { userId: USER, workspaceName: "temp-workspace", id: "adr-1", title: "인증 방식으로 JWT 채택", status: "accepted", content: "## 맥락\n세션 스토어 부담을 줄이기 위해\n## 결정\nJWT(HS256) + 리프레시\n## 결과\n무상태 인증" });
  await syncDecision(db, { userId: USER, workspaceName: "temp-workspace", id: "adr-2", title: "비밀번호 해시 bcrypt", status: "accepted", content: "cost 12로 bcrypt 사용" });

  // ── Checkpoints ─────────────────────────────────────────────────
  await syncCheckpoint(db, { userId: USER, workspaceName: "temp-workspace", id: "CP-001", title: "배선 변경 시 통합테스트 필수", checklist: ["application.yml 변경 확인", "mock 없는 배선 테스트"] });
  await syncCheckpoint(db, { userId: USER, workspaceName: "temp-workspace", id: "CP-002", title: "PR 전 브랜치 push 확인", checklist: ["원격 브랜치 존재", "타깃 develop"] });

  await db.close();
  console.log("✅ 데모 시드 완료 → ./local.db (userId=" + USER + ")");
}
main().catch((e) => {
  console.error("시드 실패:", e);
  process.exit(1);
});
