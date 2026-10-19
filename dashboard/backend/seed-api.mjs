// 실행 중인 로컬 백엔드(:3001)에 데모 데이터를 API로 시드한다.
// 세션 서명키를 후보에서 자동 탐색해 userId=SUGO_SEED_USER_ID(기본 github:12345)로 넣는다.
import { SignJWT } from "jose";
import { homedir } from "node:os";
import { join } from "node:path";
const USER = process.env.SUGO_SEED_USER_ID ?? "github:12345";
import { LOCAL_API_URL } from "../port-contract.mjs";

const BASE = LOCAL_API_URL;
// 데모 경로는 화면에 그대로 찍히므로 홈 디렉터리 기준으로 만든다.
const WEBAPP = join(homedir(), "webapp");
const PAYMENTS = join(homedir(), "work", "webapp-payments");

const mint = (secret) =>
  new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(USER).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 7 * 24 * 3600).sign(new TextEncoder().encode(secret));
const post = (path, body, token) =>
  fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) });

const wr = (over = {}) => ({
  startedAt: "2026-07-20T09:00:00.000Z", endedAt: "2026-07-20T11:30:00.000Z", model: "claude-opus-4-8",
  summary: "## 배경\n이메일 로그인이 없어 사용자가 진입하지 못했다.\n\n## 변경\n`EmailLoginService`를 추가하고 컨트롤러에 배선. 비밀번호는 bcrypt.\n\n## 테스트\n단위 12 + 통합 2, 전부 그린.",
  files: [
    { path: "src/main/java/auth/EmailLoginService.java", change: "added", diff: "+public class EmailLoginService {\n+  // ...\n+}" },
    { path: "src/main/java/auth/LoginController.java", change: "modified", diff: "@@\n-  // TODO\n+  loginService.login(req);" },
    { path: "src/test/java/auth/EmailLoginServiceTest.java", change: "added" },
  ],
  runtimeVerified: true, wiringVerified: true, patchVersion: 0, ...over,
});

async function main() {
  let token = null;
  for (const s of ["dev-secret-change-me"]) {
    const t = await mint(s);
    const r = await post("/api/sync/user", { userId: USER, displayName: "Local Developer" }, t);
    if (r.ok) { token = t; console.log("세션 서명키 확인됨:", JSON.stringify(s)); break; }
  }
  if (!token) { console.error("❌ 세션 서명키를 못 찾음(백엔드 SESSION_SECRET 불일치). 백엔드 재시작 후 재시도."); process.exit(1); }

  await post("/api/sync/workspace", { userId: USER, name: "temp-workspace", projects: [WEBAPP], gitSyncedProjects: [WEBAPP] }, token);
  await post("/api/sync/workspace", { userId: USER, name: "payments-api", projects: [PAYMENTS], gitSyncedProjects: [] }, token);
  await post("/api/sync/workspace-meta", { userId: USER, workspaceName: "temp-workspace", goldenRule: "테스트 먼저, 게이트는 실행증거로만 통과", checkpointsVersion: 3 }, token);

  for (const [id, title, status] of [["t1", "EmailLoginService 구현", "done"], ["t2", "로그인 컨트롤러 배선", "in_progress"], ["t3", "통합테스트", "pending"], ["t4", "비밀번호 재설정", "done"], ["t5", "레거시 인증 정리", "archived"]]) {
    await post("/api/sync/task", { userId: USER, workspaceName: "temp-workspace", id, title, project: WEBAPP, status }, token);
  }

  await post("/api/sync/roadmap", { userId: USER, workspaceName: "temp-workspace", nodes: [
    { id: "spec1", title: "이메일 로그인 스펙", level: "spec", status: "done", dependsOn: [], specPath: "sugo/features/login/prd.md" },
    { id: "ws1", title: "로그인 워크스트림", level: "workstream", status: "in_progress", dependsOn: [] },
    { id: "t1", title: "EmailLoginService 구현", level: "task", status: "done", dependsOn: ["spec1"], parent: "ws1", ref: "work-result.md", workResult: wr(), lineage: [{ version: 0, completedAt: "2026-07-20T11:30:00.000Z", commitType: "feat", title: "이메일 로그인", summary: "최초 구현", changedFiles: ["EmailLoginService.java", "LoginController.java"], runtimeVerified: true, wiringVerified: true }] },
    { id: "t2", title: "로그인 컨트롤러 배선", level: "task", status: "in_progress", dependsOn: ["t1"], parent: "ws1", workResult: wr({ endedAt: undefined, runtimeVerified: false, wiringVerified: false }) },
    { id: "t3", title: "통합테스트", level: "task", status: "pending", dependsOn: ["t2"], parent: "ws1" },
    { id: "t4", title: "비밀번호 재설정", level: "task", status: "done", dependsOn: [], ref: "work-result-v2.md", workResult: wr({ model: "claude-sonnet-5", patchVersion: 1, seed: "소셜 로그인도 지원", prRefs: { status: "OK", branch: "feature/pw-reset", prUrl: "https://bitbucket.example.com/projects/X/repos/y/pull-requests/42", prId: 42 } }), lineage: [
      { version: 0, completedAt: "2026-07-18T10:00:00.000Z", commitType: "feat", title: "비밀번호 재설정 초안", summary: "이메일 링크 방식", changedFiles: ["PwResetService.java"], runtimeVerified: true, wiringVerified: true },
      { version: 1, completedAt: "2026-07-19T14:00:00.000Z", commitType: "patch", title: "소셜 로그인 연동", summary: "OAuth 추가", seed: "소셜 로그인도 지원", changedFiles: ["OauthService.java"], runtimeVerified: true, wiringVerified: true },
    ] },
    { id: "t5", title: "레거시 인증 정리", level: "task", status: "dropped", dependsOn: [], note: "범위 밖으로 판단해 드롭" },
  ] }, token);

  await post("/api/workspaces/temp-workspace/roadmap/manual-status", { nodeId: "t3", status: "done" }, token);

  await post("/api/sync/roadmap", { userId: USER, workspaceName: "payments-api", nodes: [
    { id: "p1", title: "결제 요청 API", level: "task", status: "done", dependsOn: [] },
    { id: "p2", title: "웹훅 검증", level: "task", status: "done", dependsOn: ["p1"] },
    { id: "p3", title: "정산 배치", level: "task", status: "done", dependsOn: ["p2"] },
  ] }, token);

  for (let i = 0; i < 12; i++) {
    await post("/api/sync/history", { userId: USER, workspaceName: "temp-workspace", id: `h${i}`, taskTitle: i % 2 ? "로그인 컨트롤러 배선" : "EmailLoginService 구현", summary: `작업 ${i}: 기능 구현 및 검증 완료`, keyDecisions: ["JWT 채택", "bcrypt 해시"], filesChanged: [{ path: "EmailLoginService.java", change: "added" }], estimatedHumanHours: 3 + (i % 3), aiExecutionMinutes: 40 + i * 3 }, token);
  }

  await post("/api/sync/decision", { userId: USER, workspaceName: "temp-workspace", id: "adr-1", title: "인증 방식으로 JWT 채택", status: "accepted", content: "## 맥락\n세션 스토어 부담 감소\n## 결정\nJWT(HS256)+리프레시\n## 결과\n무상태 인증" }, token);
  await post("/api/sync/decision", { userId: USER, workspaceName: "temp-workspace", id: "adr-2", title: "비밀번호 해시 bcrypt", status: "accepted", content: "cost 12로 bcrypt 사용" }, token);
  await post("/api/sync/checkpoint", { userId: USER, workspaceName: "temp-workspace", id: "CP-001", title: "배선 변경 시 통합테스트 필수", checklist: ["application.yml 변경 확인", "mock 없는 배선 테스트"] }, token);
  await post("/api/sync/checkpoint", { userId: USER, workspaceName: "temp-workspace", id: "CP-002", title: "PR 전 브랜치 push 확인", checklist: ["원격 브랜치 존재", "타깃 develop"] }, token);

  console.log("✅ 데모 시드 완료 (userId=" + USER + ") — 대시보드 새로고침");
}
main().catch((e) => { console.error("시드 실패:", e); process.exit(1); });
