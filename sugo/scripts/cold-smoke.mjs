/**
 * "DB 없는 콜드 맥북 + 플러그인만 다운로드" 재현 스모크.
 *
 * 실행:  node scripts/cold-smoke.mjs   (sugo/ 에서. 사전 `npm run build` 필요 — dist를 검사한다)
 *
 * vitest 대상이 아니다 — 빌드된 번들을 **별도 프로세스로 띄워 실제 MCP 프로토콜로** 두들기는
 * 수동 하네스라서, 단위테스트와 성격이 다르다(테스트가 잡지 못하는 배포 형태의 문제를 잡는다).
 *
 * 재현하는 조건:
 *  - 플러그인 배포물만 복사(node_modules 없음, src/test 없음) — 마켓플레이스 설치와 같은 상태
 *  - 완전히 빈 HOME(레지스트리·settings.json·work 디렉터리 전무)
 *  - 대시보드/DB 미설정(SUGO_DASHBOARD_* env 전부 제거)
 *
 * 시나리오 A: 위 조건에서 핵심 기능이 다 되는가
 * 시나리오 B: 대시보드 URL은 있는데 서버가 죽어있을 때(DB 다운) 파이프라인이 막히는가
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// 이 스크립트 위치(sugo/scripts/) 기준 — 어느 OS/어느 cwd에서 실행해도 같게 동작해야 한다.
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
// 마켓플레이스 설치가 주는 것 = 저장소의 플러그인 디렉터리. node_modules/src/test는 안 온다.
const SHIPPED = [".claude-plugin", "dist", "harness-library", "wasm-grammars", "commands", "agents", "skills", "hooks"];

const results = [];
function check(label, pass, detail = "") {
  results.push({ label, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}
/** 도구 호출이 진짜 성공했는가. MCP 검증 에러(__raw/__rpcError)는 ok 필드가 아예 없어서
 *  `r.ok !== false`만 보면 조용히 통과해버린다 — 실제로 한 번 그렇게 속았다. */
const toolOk = (r) => r && r.__rpcError === undefined && r.__raw === undefined && r.ok !== false;

function makeInstall(root) {
  const install = join(root, "plugin");
  mkdirSync(install, { recursive: true });
  for (const d of SHIPPED) cpSync(join(SRC, d), join(install, d), { recursive: true });
  return install;
}

function startServer(install, home, extraEnv) {
  const env = { ...process.env, SUGO_HOME_OVERRIDE: home, ...extraEnv };
  // 콜드 조건: 이 PC에 남아있을 수 있는 대시보드 설정을 확실히 제거
  for (const k of ["SUGO_DASHBOARD_API_URL", "SUGO_DASHBOARD_USER_ID", "SUGO_DASHBOARD_API_TOKEN"]) {
    if (!(k in (extraEnv ?? {}))) delete env[k];
  }
  const server = spawn(process.execPath, [join(install, "dist", "index.bundle.mjs")], { env, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  server.stderr.on("data", (c) => (stderr += c));

  let buf = "";
  const pending = new Map();
  server.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });

  let nextId = 1;
  const rpc = (method, params) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => reject(new Error(`timeout(60s): ${method} ${params?.name ?? ""}`)), 60000);
    });
  };
  const callTool = async (name, args) => {
    const res = await rpc("tools/call", { name, arguments: args });
    if (res.error) return { __rpcError: res.error };
    const text = res.result?.content?.[0]?.text ?? "";
    try { return JSON.parse(text); } catch { return { __raw: text }; }
  };
  return { server, rpc, callTool, getStderr: () => stderr };
}

async function handshake(rpc, server) {
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cold-smoke", version: "0" } });
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
}

const VALID_PRD = "REQ-1: 이메일 로그인 기능을 제공한다. " + "가".repeat(90);
const GOOD_SUMMARY = [
  "배경: 사용자가 이메일로 로그인할 수 없는 문제가 있었다.",
  "변경: EmailLoginService를 추가하고 컨트롤러에 연결했다.",
  "설계: 기존 인증 흐름을 재사용하며 비밀번호 해시는 bcrypt를 사용했다.",
  "테스트: 단위테스트 12개와 통합테스트 2개를 추가해 전부 통과를 확인했다.",
].join("\n");

async function runPipeline(callTool, project, featureName) {
  const start = await callTool("sugo_plan", { action: "start", projectPath: project, featureName });
  const sessionId = start.sessionId;
  if (!sessionId) return { ok: false, at: "start", detail: JSON.stringify(start).slice(0, 300) };
  const steps = [
    ["clarify", {}],
    ["prd", { prdContent: VALID_PRD }],
    ["ready", {}],
    ["baseline_capture", {}],
    ["contract_start", {}],
    ["contract_done", {}],
    ["code_start", {}],
  ];
  for (const [action, extra] of steps) {
    const r = await callTool("sugo_plan", { action, sessionId, ...extra });
    if (r.ok === false || r.__rpcError) return { ok: false, at: action, detail: JSON.stringify(r).slice(0, 300) };
  }
  await callTool("sugo_analyze", { sessionId, changedFiles: [] });
  for (const [action, extra] of [
    ["code_done", { changedFiles: [], wiringTestAdded: true }],
    ["test_start", {}],
  ]) {
    const r = await callTool("sugo_plan", { action, sessionId, ...extra });
    if (r.ok === false || r.__rpcError) return { ok: false, at: action, detail: JSON.stringify(r).slice(0, 300) };
  }
  await callTool("sugo_record_test_evidence", { sessionId, command: "npm test", exitCode: 0, failed: 0 });
  for (const [action, extra] of [
    ["test_done", { testPassed: true }],
    ["review_start", {}],
  ]) {
    const r = await callTool("sugo_plan", { action, sessionId, ...extra });
    if (r.ok === false || r.__rpcError) return { ok: false, at: action, detail: JSON.stringify(r).slice(0, 300) };
  }
  // review_done의 VALIDATE_NOT_CALLED 게이트 충족용 — 이 프로젝트에 적용된 하네스(default/framework
  // node)엔 auto 체크가 없어 빈 제출로도 verifiedFailures 없이 통과한다.
  await callTool("sugo_validate", { sessionId, validationResults: [] });
  // review_done의 LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용(§P6-1) — 빈 tools면 경고 없이 통과한다.
  await callTool("sugo_check_lethal_trifecta", { sessionId, tools: [] });
  for (const [action, extra] of [
    ["review_done", { userConfirmed: true, summary: GOOD_SUMMARY, runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true } }],
    ["docs_done", {}],
    ["commit", {}],
  ]) {
    const r = await callTool("sugo_plan", { action, sessionId, ...extra });
    if (r.ok === false || r.__rpcError) return { ok: false, at: action, detail: JSON.stringify(r).slice(0, 300) };
  }
  return { ok: true, sessionId };
}

const root = mkdtempSync(join(tmpdir(), "sugo-cold-"));
try {
  // ─────────────────────────────────────────────────────────────
  console.log("\n[시나리오 A] 콜드 설치 + DB/대시보드 미설정");
  const install = makeInstall(root);
  check("배포물에 node_modules가 없다(런타임 의존 없음)", !existsSync(join(install, "node_modules")));

  const homeA = join(root, "homeA");
  const projectA = join(root, "projectA");
  mkdirSync(homeA, { recursive: true });
  mkdirSync(join(projectA, "src", "main"), { recursive: true });
  writeFileSync(join(projectA, "package.json"), JSON.stringify({ name: "cold", scripts: { test: "vitest" } }));
  writeFileSync(join(projectA, "src", "main", "app.ts"), "export function main() { return 1; }\n");
  check("HOME이 완전히 비어 있다(콜드)", readdirSync(homeA).length === 0);

  const A = startServer(install, homeA, {});
  await handshake(A.rpc, A.server);

  const tools = await A.rpc("tools/list", {});
  const toolNames = tools.result.tools.map((t) => t.name).sort();
  check("도구 노출", toolNames.length > 0, `${toolNames.length}개`);
  console.log("  [도구] " + toolNames.join(", "));

  const added = await A.callTool("sugo_add", { projectPath: projectA, workspace: "cold-ws" });
  check("sugo_add — 프로젝트 등록 + 하네스 합성(로컬 라이브러리)", toolOk(added), JSON.stringify(added).slice(0, 160));

  // ── 체크포인트 ──
  const cpAdd = await A.callTool("sugo_checkpoint", {
    action: "add", workspace: "cold-ws", title: "배포 전 점검", category: "release",
    checklist: ["마이그레이션 확인", "롤백 절차 확인"],
  });
  check("checkpoint add", toolOk(cpAdd), JSON.stringify(cpAdd).slice(0, 160));
  const cpId = cpAdd.checkpoint?.id ?? cpAdd.id;

  const cpList = await A.callTool("sugo_checkpoint", { action: "list", workspace: "cold-ws" });
  check("checkpoint list", Array.isArray(cpList.checkpoints) && cpList.checkpoints.length === 1, JSON.stringify(cpList).slice(0, 160));

  const cpGet = await A.callTool("sugo_checkpoint", { action: "get", workspace: "cold-ws", id: cpId });
  check("checkpoint get", toolOk(cpGet), JSON.stringify(cpGet).slice(0, 160));

  const mem = await A.callTool("sugo_checkpoint", { action: "memory", workspace: "cold-ws", note: "콜드 환경 메모" });
  check("checkpoint memory(기록)", toolOk(mem), JSON.stringify(mem).slice(0, 160));
  const readMem = await A.callTool("sugo_checkpoint", { action: "read_memory", workspace: "cold-ws" });
  check("checkpoint read_memory(회수)", JSON.stringify(readMem).includes("콜드 환경 메모"), JSON.stringify(readMem).slice(0, 160));

  const t0 = Date.now();
  const cpPull = await A.callTool("sugo_checkpoint", { action: "pull", workspace: "cold-ws", projectPath: projectA });
  const pullMs = Date.now() - t0;
  check("checkpoint pull(대시보드 없음) — 매달리지 않고 즉시 반환", pullMs < 3000, `${pullMs}ms`);
  check("checkpoint pull — 크래시 없이 결과 반환", cpPull.__rpcError === undefined, JSON.stringify(cpPull).slice(0, 200));

  const cpSync = await A.callTool("sugo_checkpoint", { action: "sync", workspace: "cold-ws", id: cpId });
  check("checkpoint sync(대시보드 없음) — 막지 않는다", cpSync.__rpcError === undefined, JSON.stringify(cpSync).slice(0, 200));
  check("checkpoint sync — 안 보냈으면 synced:false로 사실대로 보고", cpSync.synced === false && cpSync.dashboard === "disabled", JSON.stringify(cpSync).slice(0, 200));

  const wsSync = await A.callTool("sugo_workspace", { action: "sync", name: "cold-ws" });
  check("workspace sync — 안 보냈으면 synced:false로 사실대로 보고", wsSync.synced === false && wsSync.dashboard === "disabled", JSON.stringify(wsSync).slice(0, 200));

  // ── 워크스페이스 / 태스크 ──
  const wsList = await A.callTool("sugo_workspace", { action: "list" });
  check("workspace list", JSON.stringify(wsList).includes("cold-ws"), JSON.stringify(wsList).slice(0, 160));
  await A.callTool("sugo_workspace", { action: "remember", name: "cold-ws", note: "콜드에서 남긴 결정" });
  const recall = await A.callTool("sugo_workspace", { action: "recall", name: "cold-ws" });
  check("workspace remember/recall", JSON.stringify(recall).includes("콜드에서 남긴 결정"), JSON.stringify(recall).slice(0, 160));

  const taskAdd = await A.callTool("sugo_task", { action: "add", workspace: "cold-ws", title: "로그인 구현", project: projectA });
  check("task add", toolOk(taskAdd), JSON.stringify(taskAdd).slice(0, 160));

  // ── 파이프라인 완주 ──
  const pipe = await runPipeline(A.callTool, projectA, "로그인 기능");
  check("13게이트 파이프라인 완주(start→commit)", pipe.ok, pipe.ok ? "" : `${pipe.at}에서 막힘: ${pipe.detail}`);

  // ── AST/wasm, 조회 도구 ──
  const ov = await A.callTool("sugo_overview", { projectPath: projectA });
  check("sugo_overview — wasm 문법 로딩(콜드)", JSON.stringify(ov).includes("app.ts"), JSON.stringify(ov).slice(0, 160));
  const ex = await A.callTool("sugo_explore", { projectPath: projectA, filePaths: ["src/main/app.ts"] });
  check("sugo_explore — 지정 파일 AST 파싱", JSON.stringify(ex).includes("app.ts"), JSON.stringify(ex).slice(0, 160));
  const ctx = await A.callTool("sugo_get_project_context", { projectPath: projectA });
  check("sugo_get_project_context — 하네스/규칙 로드", ctx.__rpcError === undefined && ctx.ok !== false, JSON.stringify(ctx).slice(0, 160));

  // health:true는 대시보드 연결 상태를 실제로 확인한다 — 콜드에서 매달리면 안 된다.
  const tHealth = Date.now();
  const st = await A.callTool("sugo_status", { health: true });
  const healthMs = Date.now() - tHealth;
  check("sugo_status(health) — 대시보드 미설정이어도 즉시 응답", st.__rpcError === undefined && healthMs < 3000, `${healthMs}ms ${JSON.stringify(st).slice(0, 200)}`);

  const route = await A.callTool("sugo_route", { input: "로그인 버그를 고쳐줘" });
  check("sugo_route — 자연어 라우팅", route.__rpcError === undefined && route.ok !== false, JSON.stringify(route).slice(0, 200));

  const ontology = await A.callTool("sugo_ontology", { view: "invariants" });
  check(
    "sugo_ontology — 배포 번들이 결정적 모델 식별자를 제공",
    toolOk(ontology)
      && ontology.model?.schemaVersion === 1
      && ontology.model?.revision === 2
      && /^sha256:[a-f0-9]{64}$/.test(ontology.model?.modelHash ?? ""),
    JSON.stringify(ontology.model ?? ontology).slice(0, 200),
  );

  const specAdd = await A.callTool("sugo_spec", { action: "add", workspace: "cold-ws", name: "login-spec", type: "architecture", content: "# 로그인 스펙\n\n본문" });
  check("sugo_spec add", toolOk(specAdd), JSON.stringify(specAdd).slice(0, 160));
  const histAdd = await A.callTool("sugo_history", { action: "add", workspace: "cold-ws", task_id: "task-1", task_title: "로그인 구현", summary: "콜드 환경 기록" });
  check("sugo_history add", toolOk(histAdd), JSON.stringify(histAdd).slice(0, 160));
  const rm = await A.callTool("sugo_roadmap", { action: "list", workspace: "cold-ws" });
  check("sugo_roadmap list", toolOk(rm), JSON.stringify(rm).slice(0, 200));
  const rmReady = await A.callTool("sugo_roadmap", { action: "ready", workspace: "cold-ws" });
  check("sugo_roadmap ready(DAG 계산)", toolOk(rmReady), JSON.stringify(rmReady).slice(0, 200));
  const tPull = Date.now();
  const rmPull = await A.callTool("sugo_roadmap", { action: "pull_ordering", workspace: "cold-ws" });
  check("sugo_roadmap pull_ordering(대시보드 없음) — 즉시 폴백", toolOk(rmPull) && Date.now() - tPull < 3000, `${Date.now() - tPull}ms ${JSON.stringify(rmPull).slice(0, 140)}`);

  // 도구명은 클라이언트에서 서버 간 전역으로 노출된다 — 접두어 없는 이름은 충돌 여지를 남긴다.
  const unprefixed = toolNames.filter((n) => !n.startsWith("sugo_"));
  check("모든 도구가 sugo_ 접두어를 가진다", unprefixed.length === 0, unprefixed.join(", ") || "전부 sugo_*");
  const ver = await A.callTool("sugo_version", {});
  check("sugo_version 도구 동작", toolOk(ver), JSON.stringify(ver).slice(0, 140));

  const cpRemove = await A.callTool("sugo_checkpoint", { action: "remove", workspace: "cold-ws", id: cpId });
  check("checkpoint remove", toolOk(cpRemove), JSON.stringify(cpRemove).slice(0, 160));

  const errOut = A.getStderr();
  check("서버 stderr에 크래시/미처리 예외 없음", !/Error|ECONNREFUSED|unhandled/i.test(errOut), errOut.slice(0, 300) || "(비어 있음)");
  A.server.kill();

  // ─────────────────────────────────────────────────────────────
  console.log("\n[시나리오 B] 대시보드 URL은 설정됐지만 서버가 죽어 있음(DB 다운)");
  const homeB = join(root, "homeB");
  const projectB = join(root, "projectB");
  mkdirSync(homeB, { recursive: true });
  mkdirSync(projectB, { recursive: true });
  writeFileSync(join(projectB, "package.json"), JSON.stringify({ name: "coldB", scripts: { test: "vitest" } }));

  const B = startServer(install, homeB, {
    SUGO_DASHBOARD_API_URL: "http://127.0.0.1:45123", // 아무도 듣지 않는 포트
    SUGO_DASHBOARD_USER_ID: "colduser",
  });
  await handshake(B.rpc, B.server);
  await B.callTool("sugo_add", { projectPath: projectB, workspace: "down-ws" });

  const tB = Date.now();
  const pipeB = await runPipeline(B.callTool, projectB, "결제 연동");
  const elapsed = Date.now() - tB;
  check("대시보드가 죽어 있어도 파이프라인 완주", pipeB.ok, pipeB.ok ? "" : `${pipeB.at}에서 막힘: ${pipeB.detail}`);
  check("대시보드 다운이 파이프라인을 무한정 붙잡지 않는다", elapsed < 60000, `${(elapsed / 1000).toFixed(1)}s`);

  const cpB = await B.callTool("sugo_checkpoint", {
    action: "add", workspace: "down-ws", title: "다운 상태 점검", checklist: ["항목"],
  });
  check("대시보드 다운 상태에서도 checkpoint add 동작", toolOk(cpB), JSON.stringify(cpB).slice(0, 160));
  B.server.kill();

  console.log("\n[참고] 노출 도구 목록:\n  " + toolNames.join(", "));
} catch (err) {
  check("스모크 실행", false, String(err));
} finally {
  rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? "✅ 콜드 환경 전부 통과" : `❌ 실패 ${failed.length}건`} (총 ${results.length}건)`);
if (failed.length) console.log("실패 항목:\n" + failed.map((f) => "  - " + f.label).join("\n"));
process.exit(failed.length === 0 ? 0 : 1);
