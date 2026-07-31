/**
 * 로컬 확인용 원클릭 준비 스크립트.
 *
 * 실제 MySQL에 데모 데이터를 넣고, GitHub OAuth를 거치지 않고 들어갈 수 있는 **세션 토큰**을
 * 발급해 브라우저 콘솔에 붙여넣을 스니펫을 출력한다. 로그인 우회용 라우트를 서버에 새로
 * 뚫지 않는다 — 그런 건 한 번 만들면 프로덕션까지 따라간다.
 *
 * 실행: MYSQL_PASSWORD=... SESSION_SECRET=... npx tsx dev-local.mts
 */
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

console.log(`
────────────────────────────────────────────────────────────────
데모 데이터 시드 완료 (userId=${USER})

1) 브라우저에서 ${origin} 열기
2) F12 → Console 에 아래 한 줄 붙여넣고 Enter → 새로고침

localStorage.setItem('sugo_auth', JSON.stringify({user:{id:${JSON.stringify(USER)}},accessToken:${JSON.stringify(token)},refreshToken:null,expiresAt:${Date.now() + 24 * 3600 * 1000}}));location.href='/sessions'

────────────────────────────────────────────────────────────────`);

await db.close();
