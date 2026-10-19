/**
 * 로컬 확인용 원클릭 준비 스크립트.
 *
 * 실제 MySQL에 **Spec ⊃ Run ⊃ Task ⊃ REQ 4층 구조** 그대로의 시나리오 데이터를 넣고,
 * GitHub OAuth를 거치지 않고 들어갈 수 있는 세션 토큰을 발급한다. 로그인 우회 라우트를 서버에
 * 새로 뚫지 않는다 — 그런 건 한 번 만들면 프로덕션까지 따라간다. 대신 브라우저 쪽 정적
 * 페이지(`frontend/dist/dev-login.html`, 커밋 안 됨)가 세션을 심는다.
 *
 * 실행: MYSQL_PASSWORD=... SESSION_SECRET=... npx tsx dev-local.mts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { initDb } from "./src/db/init.js";
import { issueSession } from "./src/auth/session.js";
import { ingestActivity } from "./src/services/activityService.js";
import {
  syncCheckpoint,
  syncDecision,
  syncHistory,
  syncPluginVersion,
  syncRoadmap,
  syncTask,
  syncUser,
  syncWorkspace,
} from "./src/services/syncService.js";

const USER = process.env.DEV_USER_ID ?? "local-dev";
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error("SESSION_SECRET이 필요합니다.");

/**
 * 데모 프로젝트 경로. 화면에 그대로 찍히므로 실행하는 OS의 홈 디렉터리 기준으로 만든다
 * (같은 상수를 workspace와 task가 공유해야 매칭이 된다).
 */
const WEBAPP = join(homedir(), "webapp");
const WEBAPP_ADMIN = join(homedir(), "webapp-admin");
const PAYMENTS = join(homedir(), "work", "webapp-payments");

const db = await initDb();

/** 재실행이 누적되지 않게 이 사용자 데이터를 먼저 비운다(시드는 멱등해야 한다). */
for (const t of ["sugo_roadmap_nodes", "sugo_tasks", "sugo_history", "sugo_decisions", "sugo_checkpoints", "sugo_activity_events"]) {
  try {
    await db.exec(`DELETE FROM ${t} WHERE user_id = ?`, [USER]);
  } catch {
    /* 지연생성 테이블은 아직 없을 수 있다 */
  }
}

await syncUser(db, { userId: USER, displayName: "로컬 개발" });
// 플러그인이 push하는 값. 안 심으면 상단바와 Playbook 배지가 "v—"로 뜬다(가짜가 아니라 없는 것).
await syncPluginVersion(db, USER, "0.1.0");
await syncWorkspace(db, {
  userId: USER,
  name: "webapp",
  projects: [WEBAPP, WEBAPP_ADMIN],
  gitSyncedProjects: [WEBAPP],
});
await syncWorkspace(db, { userId: USER, name: "payments-api", projects: [PAYMENTS], gitSyncedProjects: [] });

const iso = (daysAgo: number, h = 10) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 11) + `${String(h).padStart(2, "0")}:00:00.000Z`;

// ── WORK 태스크(로드맵 task 노드와 1:1) ──────────────────────────────────────
const tasks: [string, string, string, string?][] = [
  ["t-001", "EmailLoginService 구현", "done", iso(12)],
  ["t-002", "로그인 컨트롤러 배선", "done", iso(9)],
  ["t-003", "OAuth 프로바이더 연동", "in_progress", undefined],
  ["t-004", "계정 연결/해제 API", "pending", undefined],
  ["t-005", "비밀번호 재설정 메일 발송", "pending", undefined],
];
for (const [id, title, status, completedAt] of tasks) {
  await syncTask(db, {
    userId: USER,
    workspaceName: "webapp",
    id,
    title,
    project: WEBAPP,
    status,
    startedAt: status === "pending" ? undefined : iso(14),
    completedAt,
  });
}
await syncTask(db, { userId: USER, workspaceName: "payments-api", id: "t-101", title: "결제 취소 API", project: PAYMENTS, status: "done", completedAt: iso(20) });

// ── 4층 구조: Spec ⊃ Run(workstream) ⊃ Task ⊃ REQ(subtask) ────────────────
// REQ에는 항상 `{taskId}::REQ-CONFIRM`(사용자 최종확인)이 붙는다 — 에이전트가 완료 못 하고
// 사람의 review_done으로만 닫힌다.
// depends_on은 **형제(같은 RUN 안) task 사이의 순서**다(링크 타입 "task → task,
// 형제 순서/의존"). RUN을 가로지르는 링크를 심으면 캔버스에 RUN 상자를 관통하는 대각선이
// 그려져 "RUN이 RUN을 기다린다"는, 온톨로지에 없는 관계로 읽힌다. RUN 사이의 순서는 의존이
// 아니라 포함(parent)과 status로만 표현한다.
await syncRoadmap(db, USER, "webapp", [
  { id: "spec-auth", title: "인증 도메인 마스터 PRD", level: "spec", status: "in_progress", specPath: "docs/prd/auth.md" },

  { id: "run-001", title: "이메일 로그인", level: "workstream", status: "done", parent: "spec-auth" },
  { id: "t-001", title: "EmailLoginService 구현", level: "task", status: "done", parent: "run-001" },
  { id: "t-001::REQ-001", title: "REQ-001 이메일+비밀번호 인증", level: "subtask", status: "done", parent: "t-001" },
  { id: "t-001::REQ-002", title: "REQ-002 비밀번호 bcrypt 해시", level: "subtask", status: "done", parent: "t-001" },
  { id: "t-001::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "done", parent: "t-001" },
  { id: "t-002", title: "로그인 컨트롤러 배선", level: "task", status: "done", parent: "run-001", dependsOn: ["t-001"] },
  { id: "t-002::REQ-003", title: "REQ-003 POST /auth/login 계약", level: "subtask", status: "done", parent: "t-002" },
  { id: "t-002::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "done", parent: "t-002" },

  { id: "run-002", title: "소셜 로그인", level: "workstream", status: "in_progress", parent: "spec-auth" },
  { id: "t-003", title: "OAuth 프로바이더 연동", level: "task", status: "in_progress", parent: "run-002" },
  { id: "t-003::REQ-004", title: "REQ-004 Google OAuth 콜백", level: "subtask", status: "done", parent: "t-003" },
  { id: "t-003::REQ-005", title: "REQ-005 최초 로그인 시 계정 생성", level: "subtask", status: "in_progress", parent: "t-003" },
  { id: "t-003::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "pending", parent: "t-003" },
  { id: "t-004", title: "계정 연결/해제 API", level: "task", status: "pending", parent: "run-002", dependsOn: ["t-003"] },
  { id: "t-004::REQ-006", title: "REQ-006 소셜 계정 unlink", level: "subtask", status: "pending", parent: "t-004" },
  { id: "t-004::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "pending", parent: "t-004" },

  { id: "run-003", title: "비밀번호 재설정", level: "workstream", status: "blocked", parent: "spec-auth" },
  { id: "t-005", title: "비밀번호 재설정 메일 발송", level: "task", status: "blocked", parent: "run-003" },
  { id: "t-005::REQ-007", title: "REQ-007 재설정 토큰 만료 30분", level: "subtask", status: "pending", parent: "t-005" },
  { id: "t-005::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "pending", parent: "t-005" },

  // 패치 계보 확인용 — patch는 새 Run을 만들지 않고 **처음 Run(run-001)에 귀속**된다.
  // depth 0마다 새 컬럼, depth>0은 그 컬럼에 세로로 쌓인다.
  { id: "t-001-p1", title: "로그인 실패 카운터 추가", level: "task", status: "done", parent: "run-001", lineage: { root: "t-001", depth: 0, version: 1 } },
  { id: "t-001-p2", title: "계정 잠금 해제 스케줄러", level: "task", status: "done", parent: "run-001", lineage: { root: "t-001", depth: 1, version: 2 } },
  { id: "t-001-p3", title: "bcrypt cost 재조정", level: "task", status: "in_progress", parent: "run-001", lineage: { root: "t-001", depth: 0, version: 3 } },

  // 📋미분류 밴드 확인용 — 아직 어느 Spec에도 편입되지 않은 RUN(parent 없음).
  // 캔버스에서 SPEC 컨테이너 위로 끌어다 놓으면 편입된다(assignRunToSpec).
  { id: "run-005", title: "2FA (Spec 미편입)", level: "workstream", status: "pending" },
  { id: "t-007", title: "TOTP 시크릿 발급", level: "task", status: "pending", parent: "run-005" },
  { id: "t-007::REQ-008", title: "REQ-008 백업코드 10개 생성", level: "subtask", status: "pending", parent: "t-007" },
  { id: "t-007::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "pending", parent: "t-007" },

  // 폐기함 확인용 — 최상위 dropped RUN 하나(하위까지 cascade된 상태).
  { id: "run-004", title: "SAML SSO (보류)", level: "workstream", status: "dropped", parent: "spec-auth" },
  { id: "t-006", title: "IdP 메타데이터 파서", level: "task", status: "dropped", parent: "run-004" },
]);

await syncRoadmap(db, USER, "payments-api", [
  { id: "spec-pay", title: "결제 도메인 PRD", level: "spec", status: "done", specPath: "docs/prd/payments.md" },
  { id: "run-101", title: "결제 취소", level: "workstream", status: "done", parent: "spec-pay" },
  { id: "t-101", title: "결제 취소 API", level: "task", status: "done", parent: "run-101" },
  { id: "t-101::REQ-101", title: "REQ-101 부분취소 금액 검증", level: "subtask", status: "done", parent: "t-101" },
  { id: "t-101::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "done", parent: "t-101" },
]);

// ── 완료 이력(WorkLog) + 생산성 지표 ─────────────────────────────────────────
await syncHistory(db, {
  userId: USER, workspaceName: "webapp", id: "log-t-001", taskId: "t-001", taskTitle: "EmailLoginService 구현",
  summary: "이메일+비밀번호 인증을 담당하는 EmailLoginService를 추가했다.\n비밀번호는 bcrypt(cost 12)로 해시하고, 기존 SecurityConfig의 필터 체인에 배선했다.\n단위테스트 12개 + @SpringBootTest 통합테스트 2개를 추가해 전부 통과를 확인했다.",
  keyDecisions: ["세션 대신 stateless JWT (ADR-001)", "bcrypt cost는 12 — 로그인 p99 180ms 내"],
  filesChanged: ["src/main/java/auth/EmailLoginService.java", "src/main/java/auth/SecurityConfig.java", "src/test/java/auth/EmailLoginServiceTest.java"],
  completedAt: iso(12), estimatedHumanHours: 6, userReportedHumanHours: 5, aiExecutionMinutes: 42, estimationBasis: "trace",
});
await syncHistory(db, {
  userId: USER, workspaceName: "webapp", id: "log-t-002", taskId: "t-002", taskTitle: "로그인 컨트롤러 배선",
  summary: "POST /auth/login 엔드포인트를 열고 EmailLoginService에 연결했다.\n요청/응답 DTO를 계약 테스트로 고정했고, 실패 응답은 401 + 코드만 반환해 계정 존재 여부가 새지 않게 했다.\n계약테스트 red→green 전이를 기록했다.",
  keyDecisions: ["실패 응답에 사유를 담지 않는다(계정 열거 방지)"],
  filesChanged: ["src/main/java/auth/AuthController.java", "src/test/java/auth/AuthContractTest.java"],
  completedAt: iso(9), estimatedHumanHours: 3, userReportedHumanHours: 3.5, aiExecutionMinutes: 24, estimationBasis: "trace",
});
await syncHistory(db, {
  userId: USER, workspaceName: "payments-api", id: "log-t-101", taskId: "t-101", taskTitle: "결제 취소 API",
  summary: "부분취소 금액 검증을 포함한 결제 취소 API를 추가했다.\n원거래 금액 초과 취소를 도메인 레벨에서 차단하고, 멱등키로 중복 취소를 막았다.\n통합테스트로 PG 목 응답 3종을 검증했다.",
  keyDecisions: ["멱등키는 클라이언트가 생성"], filesChanged: ["src/payments/CancelService.java"],
  completedAt: iso(20), estimatedHumanHours: 8, userReportedHumanHours: 7, aiExecutionMinutes: 55, estimationBasis: "trace",
});

// ── ADR ──────────────────────────────────────────────────────────────────────
// SPEC 원문(📄) 버튼이 실제 내용을 보여주도록 — 백엔드 getSpecContent는 decisions를 id/title로
// 매칭하므로, SPEC 노드 제목과 같은 제목의 ADR이 있어야 원문이 뜬다.
await syncDecision(db, {
  userId: USER, workspaceName: "webapp", id: "auth.md", title: "인증 도메인 마스터 PRD", status: "accepted",
  content: `# 인증 도메인 마스터 PRD

## In-Scope
- 이메일 로그인 (REQ-001, REQ-002)
- 소셜 로그인 (REQ-004, REQ-005)
- 비밀번호 재설정 (REQ-007)

## Out-of-Scope
- SAML SSO
- LDAP 연동

## DoD
- REQ-001~REQ-007 통합테스트 통과
- 계정 열거 방지 확인(실패 응답에 사유 미노출)

### REQ-001: 이메일+비밀번호 인증
### REQ-002: 비밀번호 bcrypt 해시
### REQ-004: Google OAuth 콜백
### REQ-005: 최초 로그인 시 계정 생성
### REQ-007: 재설정 토큰 만료 30분`,
  decisionDate: iso(16),
});

await syncDecision(db, {
  userId: USER, workspaceName: "webapp", id: "ADR-001", title: "세션 대신 JWT를 쓴다", status: "accepted",
  content: "# ADR-001 — 세션 대신 JWT\n\n## 배경\n수평 확장 시 세션 스토어가 단일 병목이 된다.\n\n## 결정\nstateless JWT(RS256) + refresh 토큰.\n\n## 결과\n- 서버 간 세션 공유 불필요\n- 즉시 로그아웃은 불가 → refresh 만료(24h)로 절충",
  decisionDate: iso(14),
});
await syncDecision(db, {
  userId: USER, workspaceName: "webapp", id: "ADR-002", title: "소셜 계정은 이메일로 병합하지 않는다", status: "accepted",
  content: "# ADR-002 — 소셜 계정 병합 금지\n\n## 배경\n같은 이메일로 Google/로컬 계정이 각각 생길 수 있다.\n\n## 결정\n자동 병합하지 않고 **명시적 연결**만 허용한다.\n\n## 결과\n이메일 소유권 검증 없이 계정을 합치면 탈취 경로가 된다 — 그 위험을 UX 편의보다 우선한다.",
  decisionDate: iso(5),
});
await syncDecision(db, {
  userId: USER, workspaceName: "payments-api", id: "ADR-101", title: "멱등키는 클라이언트가 생성한다", status: "accepted",
  content: "# ADR-101\n\n재시도 주체가 클라이언트라 키도 클라이언트가 쥐는 게 맞다.", decisionDate: iso(22),
});

// ── 체크포인트(커밋 전 재발방지) ─────────────────────────────────────────────
await syncCheckpoint(db, {
  userId: USER, workspaceName: "webapp", id: "CP-001", title: "인증 변경 시 확인", category: "security",
  checklist: ["실패 응답에 계정 존재 여부가 새지 않는가", "토큰 만료/갱신 경로에 테스트가 있는가", "비밀번호가 로그에 찍히지 않는가"],
  appliesTo: [], checkpointDate: iso(13),
});
await syncCheckpoint(db, {
  userId: USER, workspaceName: "webapp", id: "CP-002", title: "DB 마이그레이션 확인", category: "db",
  checklist: ["스키마 변경이 IF NOT EXISTS인가", "기존 데이터가 고아가 되지 않는가", "롤백 경로가 있는가"],
  appliesTo: ["webapp"], checkpointDate: iso(8),
});

// ── Activity(실시간 콘솔) — 핸드오프 체인이 보이도록 ─────────────────────────
// agent는 null일 수 있다(에이전트가 아닌 SYSTEM 이벤트). ingestActivity와 같이 `string | null`로 둔다.
const feed: [number, string, string | null, string | null, string, string][] = [
  [46, "AGENT", "MAIN", "CODE", "EXECUTE", "t-003 OAuth 프로바이더 연동 — code-agent에 위임"],
  [42, "AGENT", "CODE", null, "EXECUTE", "GoogleOAuthClient 초안 작성 (3 files)"],
  [35, "INFO", "CODE", null, "EXECUTE", "sugo_analyze 실행 — REQ-004 pass / REQ-005 partial"],
  [28, "AGENT", "CODE", "TEST", "HANDOFF", "구현 완료 → test-agent 인계 (changed: 3 files)"],
  [24, "AGENT", "TEST", null, "EXECUTE", "./gradlew check — 통합 2개 추가, 전체 47 passed"],
  [18, "WARN", "TEST", null, "EXECUTE", "REQ-005 최초 로그인 계정 생성 경로 미커버 — 커버리지 경고"],
  [12, "AGENT", "TEST", "REVIEW", "HANDOFF", "테스트 그린 → review-agent 인계"],
  [6, "AGENT", "REVIEW", null, "EXECUTE", "PRD 커버리지 대조 중 — REQ-005 미커버 1건"],
  [2, "SYSTEM", null, null, "SYSTEM", "review_done 대기 — 사용자 최종확인(REQ-CONFIRM) 필요"],
];
for (const [minAgo, level, agent, handoffTo, eventType, message] of feed) {
  await ingestActivity(db, {
    userId: USER, workspace: "webapp", ts: new Date(Date.now() - minAgo * 60_000).toISOString(),
    level, agent, handoffTo, eventType, message,
  });
}

const token = await issueSession(USER, SECRET);
const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:4173";

/**
 * 로컬 확인 전용 정적 페이지를 프론트 빌드 산출물에 떨궈둔다. dist/ 안에만 있고 커밋되지 않으며,
 * 프론트를 다시 빌드하면 사라진다(그때 이 스크립트를 다시 돌리면 된다).
 */
const distDir = new URL("../frontend/dist/", import.meta.url);
try {
  await mkdir(distDir, { recursive: true });
  await writeFile(
    new URL("dev-login.html", distDir),
    `<!doctype html>
<meta charset="utf-8">
<title>Sugo 로컬 로그인</title>
<body style="background:#040711;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <p style="font-size:14px;color:#94a3b8">로컬 세션을 심는 중…</p>
  <p id="s" style="font-family:monospace;font-size:12px;color:#00b4d8"></p>
</div>
<script>
  localStorage.setItem("sugo_auth", JSON.stringify({
    user: { id: ${JSON.stringify(USER)} },
    accessToken: ${JSON.stringify(token)},
    refreshToken: null,
    expiresAt: Date.now() + 24 * 3600 * 1000
  }));
  document.getElementById("s").textContent = "OK — /sessions 로 이동합니다";
  setTimeout(function () { location.href = "/sessions"; }, 400);
</script>
</body>`,
  );
} catch {
  // 프론트를 아직 빌드 안 했으면 건너뛴다 — 아래 붙여넣기 스니펫으로도 들어갈 수 있다.
}

console.log(`
────────────────────────────────────────────────────────────────
시드 완료 (userId=${USER}) — Spec ⊃ Run ⊃ Task ⊃ REQ 4층

  webapp      spec-auth
                 ├ run-001 이메일 로그인      (done)     t-001·t-002 + REQ 5
                 ├ run-002 소셜 로그인        (진행중)   t-003·t-004 + REQ 5
                 ├ run-003 비밀번호 재설정    (막힘)     t-005 + REQ 2
                 └ run-004 SAML SSO           (폐기)     → 폐기함에서 복구 가능
  payments-api spec-pay ⊃ run-101 ⊃ t-101 ⊃ REQ 2

▶ ${origin}/dev-login.html  열기 (끝)

  GitHub OAuth를 안 붙였으므로 /login 의 로그인 버튼은 github_login_unconfigured가 정상이다.
────────────────────────────────────────────────────────────────`);

await db.close();
