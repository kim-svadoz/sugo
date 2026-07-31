/**
 * 로컬 확인용 원클릭 준비 스크립트.
 *
 * 실제 MySQL에 데모 데이터를 넣고, GitHub OAuth를 거치지 않고 들어갈 수 있는 **세션 토큰**을
 * 발급해 브라우저 콘솔에 붙여넣을 스니펫을 출력한다. 로그인 우회용 라우트를 서버에 새로
 * 뚫지 않는다 — 그런 건 한 번 만들면 프로덕션까지 따라간다.
 *
 * 실행: MYSQL_PASSWORD=... SESSION_SECRET=... npx tsx dev-local.mts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { initDb } from "./src/db/init.js";
import { issueSession } from "./src/auth/session.js";
import {
  syncCheckpoint,
  syncDecision,
  syncHistory,
  syncRoadmap,
  syncTask,
  syncUser,
  syncWorkspace,
} from "./src/services/syncService.js";

const USER = process.env.DEV_USER_ID ?? "local-dev";
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error("SESSION_SECRET이 필요합니다.");

const db = await initDb();

await syncUser(db, { userId: USER, displayName: "로컬 개발" });

await syncWorkspace(db, { userId: USER, name: "splearn", projects: ["C:/Users/user/splearn"], gitSyncedProjects: ["C:/Users/user/splearn"] });
await syncWorkspace(db, { userId: USER, name: "payments-api", projects: ["C:/work/payments"], gitSyncedProjects: [] });

await syncTask(db, { userId: USER, workspaceName: "splearn", id: "t-001", title: "이메일 로그인 기능", project: "C:/Users/user/splearn", status: "done" });
await syncTask(db, { userId: USER, workspaceName: "splearn", id: "t-002", title: "소셜 로그인 연동", project: "C:/Users/user/splearn", status: "in_progress" });
await syncTask(db, { userId: USER, workspaceName: "splearn", id: "t-003", title: "비밀번호 재설정", project: "C:/Users/user/splearn", status: "pending" });
await syncTask(db, { userId: USER, workspaceName: "payments-api", id: "t-101", title: "결제 취소 API", project: "C:/work/payments", status: "done" });

await syncHistory(db, {
  userId: USER, workspaceName: "splearn", id: "log-2026-07-30-t-001", taskId: "t-001", taskTitle: "이메일 로그인 기능",
  summary: "EmailLoginService를 추가하고 컨트롤러에 배선했다. 단위 12개 + 통합 2개 통과.",
  completedAt: "2026-07-30T10:00:00.000Z", estimatedHumanHours: 6, userReportedHumanHours: 5, aiExecutionMinutes: 42,
});

await syncDecision(db, {
  userId: USER, workspaceName: "splearn", id: "ADR-001", title: "세션 대신 JWT를 쓴다", status: "accepted",
  content: "# ADR-001\n\n수평 확장 시 세션 스토어가 병목이라 stateless JWT를 택한다.",
  decisionDate: "2026-07-28T09:00:00.000Z",
});

await syncCheckpoint(db, {
  userId: USER, workspaceName: "splearn", id: "CP-001", title: "커밋 전 마이그레이션 확인", category: "db",
  checklist: ["스키마 변경이 IF NOT EXISTS인지", "기존 데이터가 고아가 되지 않는지"], appliesTo: [],
  checkpointDate: "2026-07-29T09:00:00.000Z",
});

// §7 계층: Spec ⊃ Run ⊃ Task ⊃ REQ. run- 접두어(구 wst- 폐기)를 그대로 확인할 수 있다.
await syncRoadmap(db, USER, "splearn", [
  { id: "spec-login", title: "로그인 스펙", level: "spec", status: "in_progress" },
  { id: "run-001", title: "이메일 로그인 RUN", level: "workstream", status: "done", parent: "spec-login" },
  { id: "t-001", title: "EmailLoginService 구현", level: "task", status: "done", parent: "run-001" },
  { id: "t-001::REQ-001", title: "REQ-001 이메일+비밀번호 인증", level: "subtask", status: "done", parent: "t-001" },
  { id: "t-001::REQ-CONFIRM", title: "사용자 최종확인", level: "subtask", status: "done", parent: "t-001" },
  { id: "run-002", title: "소셜 로그인 RUN", level: "workstream", status: "in_progress", parent: "spec-login" },
  { id: "t-002", title: "OAuth 프로바이더 배선", level: "task", status: "in_progress", parent: "run-002", dependsOn: ["t-001"] },
  { id: "t-003", title: "비밀번호 재설정", level: "task", status: "pending", parent: "run-002", dependsOn: ["t-002"] },
]);

const token = await issueSession(USER, SECRET);
const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:4173";

/**
 * 로컬 확인 전용 정적 페이지를 프론트 빌드 산출물에 떨궈둔다.
 *
 * **서버에 로그인 우회 라우트를 뚫지 않는 이유:** 그런 건 한 번 만들면 프로덕션까지 따라간다.
 * 대신 이 페이지가 브라우저에서 localStorage에 세션을 심고 앱으로 보낸다 — dist/ 안에만 있고
 * 커밋되지 않으며, 프론트를 다시 빌드하면 사라진다(그때 이 스크립트를 다시 돌리면 된다).
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
데모 데이터 시드 완료 (userId=${USER})

▶ 가장 쉬운 방법:  ${origin}/dev-login.html  열기 (끝)

  GitHub OAuth를 안 붙였으므로 /login 의 로그인 버튼은 github_login_unconfigured가 정상이다.

(수동) F12 → Console 에 아래 한 줄 붙여넣고 Enter:

localStorage.setItem('sugo_auth', JSON.stringify({user:{id:${JSON.stringify(USER)}},accessToken:${JSON.stringify(token)},refreshToken:null,expiresAt:${Date.now() + 24 * 3600 * 1000}}));location.href='/sessions'

────────────────────────────────────────────────────────────────`);

await db.close();
