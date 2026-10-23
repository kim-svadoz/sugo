/**
 * README 스크린샷용 데모 데이터. readme-shots.mjs가 임시 HOME으로 띄운 Console에만 넣는다.
 * 사용자 원장(~/.claude/sugo)과 실제 Console DB는 건드리지 않는다. 회사·실제 업무 이름을 쓰지 않는다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncReviewArtifacts, syncRoadmapSnapshot, syncTask, syncWorkspace } from "../../sugo/src/dashboard/sync.js";
import { buildReviewConfirmationBlocker } from "../../sugo/src/reviewConfirmation.js";
import type { RoadmapNode, Task } from "../../sugo/src/work/types.js";
import { initDb } from "./src/db/init.js";
import { ingestActivity } from "./src/services/activityService.js";

const root = process.env.README_DEMO_ROOT;
const userId = process.env.LOCAL_DEV_USER_ID;
if (!root || !userId) throw new Error("README_DEMO_ROOT와 LOCAL_DEV_USER_ID가 필요하다. readme-shots.mjs로 실행한다.");

const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const dateOnly = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const project = (name: string) => join(root, "projects", name);
const now = at(0);

async function specFile(path: string, title: string, body: string) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `# ${title}\n\n${body}\n`, "utf8");
}

const idempotencyFiles = [
  {
    path: "src/main/java/payment/IdempotencyService.java",
    change: "added" as const,
    content: `package payment;

import java.time.Duration;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class IdempotencyService {
    private static final Duration TTL = Duration.ofHours(24);
    private final StringRedisTemplate redis;

    public IdempotencyService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public boolean reserve(String key) {
        return Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key, "PROCESSING", TTL));
    }

    public Optional<String> findCompleted(String key) {
        String value = redis.opsForValue().get(key);
        return value == null || "PROCESSING".equals(value) ? Optional.empty() : Optional.of(value);
    }
}
`,
    diff: "+ IdempotencyService 추가\n+ Redis SET NX와 24시간 TTL",
  },
  {
    path: "src/test/java/payment/CheckoutIdempotencyTest.java",
    change: "added" as const,
    content: `package payment;

class CheckoutIdempotencyTest {
    @Test
    void concurrentRequestsApproveOnlyOnce() {
        var first = fixture.checkoutAsync("order-42");
        var second = fixture.checkoutAsync("order-42");
        CompletableFuture.allOf(first, second).join();
        verify(paymentGateway, times(1)).approve();
    }
}
`,
    diff: "+ 동시 중복 요청 회귀 테스트",
  },
];

const webhookFiles = [
  {
    path: "src/main/java/webhook/RetryScheduler.java",
    change: "modified" as const,
    content: `package webhook;

import java.time.Duration;

public class RetryScheduler {
    private static final int MAX_ATTEMPTS = 6;

    public Duration nextDelay(int attempt) {
        return Duration.ofSeconds((long) Math.pow(2, attempt) * 15);
    }

    public boolean shouldMoveToDeadLetter(int attempt) {
        return attempt >= MAX_ATTEMPTS;
    }
}
`,
    diff: `@@ -3,10 +3,14 @@
 import java.time.Duration;
 
 public class RetryScheduler {
-    private static final int MAX_ATTEMPTS = 3;
+    private static final int MAX_ATTEMPTS = 6;
 
     public Duration nextDelay(int attempt) {
-        return Duration.ofSeconds(30);
+        return Duration.ofSeconds((long) Math.pow(2, attempt) * 15);
+    }
+
+    public boolean shouldMoveToDeadLetter(int attempt) {
+        return attempt >= MAX_ATTEMPTS;
     }
 }
`,
  },
  {
    path: "src/test/java/webhook/RetrySchedulerTest.java",
    change: "modified" as const,
    content: `package webhook;

class RetrySchedulerTest {
    @Test
    void delayDoublesEachAttempt() {
        assertThat(scheduler.nextDelay(2)).isEqualTo(Duration.ofSeconds(60));
    }

    @Test
    void movesToDeadLetterAfterMaxAttempts() {
        assertThat(scheduler.shouldMoveToDeadLetter(6)).isTrue();
    }
}
`,
    diff: `@@ -4,6 +4,11 @@ class RetrySchedulerTest {
     @Test
-    void delayIsConstant() {
-        assertThat(scheduler.nextDelay(2)).isEqualTo(Duration.ofSeconds(30));
+    void delayDoublesEachAttempt() {
+        assertThat(scheduler.nextDelay(2)).isEqualTo(Duration.ofSeconds(60));
+    }
+
+    @Test
+    void movesToDeadLetterAfterMaxAttempts() {
+        assertThat(scheduler.shouldMoveToDeadLetter(6)).isTrue();
     }
 }
`,
  },
];

function workResult(path: string, files: typeof idempotencyFiles, title: string, summary: string, version: number, completedAt: string) {
  return {
    path,
    startedAt: at(-2 * 3_600_000),
    endedAt: completedAt,
    summary,
    files,
    patchVersion: version,
    runtimeVerified: true,
    wiringVerified: true,
    report: {
      schemaVersion: 1 as const,
      featureName: title,
      kind: version > 0 ? "patch" as const : "feat" as const,
      patchVersion: version,
      completedAt,
      completionGrade: "verified" as const,
      summary,
      changedFiles: files.map((file) => file.path),
      requirements: [{ id: "요구사항 1", covered: true }, { id: "요구사항 2", covered: true }],
      designDecisions: ["Redis SET NX를 멱등성 저장소로 쓰고 완료 응답을 같은 TTL로 보존한다.", "처리 중인 같은 키 요청은 409로 구분한다."],
      knownLimitations: ["Redis 장애 시 다중 리전 폴백은 범위 밖이다."],
      learnings: ["동시성 회귀는 단위 테스트보다 동시 호출 통합 테스트로 잡는다."],
      verification: { test: { command: "./gradlew check", state: "pass" as const, total: 24, passed: 24, failed: 0 }, runtimeVerified: true, wiringVerified: true, validationVerdict: "pass" as const, autoVerifiedCount: 3, contradictionCount: 0 },
    },
  };
}

/* ── payments ─────────────────────────────────────────────── */
const payApi = project("payment-api");
const paySpec = join(payApi, "docs", "specs");
await specFile(join(paySpec, "checkout-guard.md"), "결제 중복 방지", "## 요구사항\n\n- 모든 결제 승인 요청은 `Idempotency-Key`를 받는다.\n- 같은 키의 요청은 최초 승인 결과를 재사용한다.");
await specFile(join(paySpec, "webhook-retry.md"), "웹훅 재처리", "## 요구사항\n\n- 실패한 웹훅을 지수 백오프로 재시도한다.\n- 6회 실패한 이벤트는 DLQ로 옮긴다.");
await specFile(join(paySpec, "partial-refund.md"), "부분 환불 API", "## 요구사항\n\n- 주문 금액 일부를 환불한다.\n- 누적 환불액은 결제 금액을 넘지 않는다.");
await specFile(join(paySpec, "receipt-mail.md"), "결제 완료 메일", "## 요구사항\n\n- 결제 완료 후 영수증 메일을 보낸다.");

const guardDir = join(payApi, "sugo", "features", dateOnly(-4).replaceAll("-", ""), "checkout-guard");
const guardV0 = workResult(join(guardDir, "work-result.md"), idempotencyFiles, "결제 중복 방지", "멱등키로 중복 결제 요청을 차단했다.", 0, at(-3 * DAY));
const guardV1 = workResult(join(guardDir, "work-result-patch-v1.md"), idempotencyFiles, "결제 중복 방지", "동시 요청에서도 최초 승인 한 건만 발생하도록 보강했다.", 1, at(-1 * DAY));
const webhookResult = workResult(join(payApi, "sugo", "features", dateOnly(-1).replaceAll("-", ""), "webhook-retry", "work-result.md"), webhookFiles, "웹훅 재처리", "실패한 웹훅을 지수 백오프로 재시도하고 6회 실패 시 DLQ로 옮긴다.", 0, now);

const webhookBlocker = buildReviewConfirmationBlocker({
  sessionId: "readme-demo-webhook",
  summary: "실패한 웹훅을 지수 백오프로 재시도하고, 6회 실패한 이벤트를 DLQ로 옮긴다.",
  changes: ["RetryScheduler 추가: 15초부터 두 배씩 늘어나는 재시도 간격", "6회 초과 이벤트를 DLQ로 이동"],
  tests: ["./gradlew check · 24/24 통과", "백오프 간격·DLQ 경계 테스트 추가"],
  designDecisions: ["재시도 상태는 이벤트 테이블의 attempt 컬럼으로 관리한다.", "DLQ 이동은 재처리 큐와 같은 트랜잭션에서 처리한다."],
  knownLimitations: ["DLQ 이벤트의 수동 재처리 화면은 다음 작업으로 남긴다."],
  files: webhookFiles.map((file) => ({ ...file })),
  report: webhookResult.report,
} as Parameters<typeof buildReviewConfirmationBlocker>[0]);

const paymentsRoadmap: RoadmapNode[] = [
  { id: "pay-spec-guard", title: "결제 중복 방지", level: "spec", status: "done", dependsOn: [], specPath: join(paySpec, "checkout-guard.md") },
  { id: "pay-run-guard", title: "결제 중복 방지", level: "workstream", status: "done", dependsOn: [], parent: "pay-spec-guard", workResult: guardV1 },
  { id: "pay-task-guard", title: "멱등키 기반 중복 결제 차단", level: "task", status: "done", dependsOn: [], parent: "pay-run-guard", ref: "pay-task-guard", workResult: guardV1, lineage: [
    { version: 0, completedAt: guardV0.endedAt, title: "최초 구현", summary: guardV0.summary, changedFiles: guardV0.report.changedFiles, workResult: { path: guardV0.path, summary: guardV0.summary, patchVersion: 0 }, requirements: [{ id: "요구사항 1", title: "멱등키를 저장한다", status: "done" as const }], runtimeVerified: true, wiringVerified: true },
    { version: 1, completedAt: guardV1.endedAt, title: "동시성 보강", summary: guardV1.summary, changedFiles: guardV1.report.changedFiles, workResult: guardV1, requirements: [{ id: "요구사항 2", title: "동시 요청에서 한 건만 승인한다", status: "done" as const }], seed: "동시 요청 보강", runtimeVerified: true, wiringVerified: true },
  ] },
  { id: "pay-spec-webhook", title: "웹훅 재처리", level: "spec", status: "in_progress", dependsOn: [], specPath: join(paySpec, "webhook-retry.md") },
  { id: "pay-run-webhook", title: "웹훅 재처리", level: "workstream", status: "in_progress", dependsOn: [], parent: "pay-spec-webhook" },
  { id: "pay-task-webhook", title: "실패 웹훅 재처리 큐", level: "task", status: "blocked", dependsOn: [], parent: "pay-run-webhook", ref: "pay-task-webhook", workResult: webhookResult, humanBlocker: webhookBlocker },
  { id: "pay-task-webhook::1", title: "지수 백오프로 재시도한다", level: "subtask", status: "done", dependsOn: [], parent: "pay-task-webhook" },
  { id: "pay-task-webhook::2", title: "6회 실패 시 DLQ로 옮긴다", level: "subtask", status: "done", dependsOn: [], parent: "pay-task-webhook" },
  { id: "pay-spec-refund", title: "부분 환불 API", level: "spec", status: "in_progress", dependsOn: [], specPath: join(paySpec, "partial-refund.md") },
  { id: "pay-run-refund", title: "부분 환불 API", level: "workstream", status: "in_progress", dependsOn: [], parent: "pay-spec-refund" },
  { id: "pay-task-refund", title: "누적 환불 한도 검증", level: "task", status: "in_progress", dependsOn: [], parent: "pay-run-refund", ref: "pay-task-refund" },
  { id: "pay-spec-receipt", title: "결제 완료 메일", level: "spec", status: "pending", dependsOn: [], specPath: join(paySpec, "receipt-mail.md") },
];

/* ── search ───────────────────────────────────────────────── */
const searchApi = project("search-api");
await specFile(join(searchApi, "docs", "specs", "saved-filter.md"), "검색 필터 저장", "## 요구사항\n\n- 사용자가 검색 필터를 이름을 붙여 저장한다.");
await specFile(join(searchApi, "docs", "specs", "typo-correction.md"), "오타 교정 제안", "## 요구사항\n\n- 결과가 없으면 교정 검색어를 제안한다.");
const filterResult = workResult(join(searchApi, "sugo", "features", dateOnly(-2).replaceAll("-", ""), "saved-filter", "work-result.md"), idempotencyFiles, "검색 필터 저장", "사용자별 검색 필터 저장과 불러오기를 추가했다.", 0, at(-2 * DAY));
const searchRoadmap: RoadmapNode[] = [
  { id: "search-spec-filter", title: "검색 필터 저장", level: "spec", status: "done", dependsOn: [], specPath: join(searchApi, "docs", "specs", "saved-filter.md") },
  { id: "search-run-filter", title: "검색 필터 저장", level: "workstream", status: "done", dependsOn: [], parent: "search-spec-filter", workResult: filterResult },
  { id: "search-task-filter", title: "필터 저장·불러오기", level: "task", status: "done", dependsOn: [], parent: "search-run-filter", ref: "search-task-filter", workResult: filterResult, lineage: [
    { version: 0, completedAt: filterResult.endedAt, title: "최초 구현", summary: filterResult.summary, changedFiles: filterResult.report.changedFiles, workResult: filterResult, requirements: [{ id: "요구사항 1", title: "필터를 저장한다", status: "done" as const }], runtimeVerified: true, wiringVerified: true },
  ] },
  { id: "search-spec-typo", title: "오타 교정 제안", level: "spec", status: "in_progress", dependsOn: [], specPath: join(searchApi, "docs", "specs", "typo-correction.md") },
  { id: "search-run-typo", title: "오타 교정 제안", level: "workstream", status: "in_progress", dependsOn: [], parent: "search-spec-typo" },
  { id: "search-task-typo", title: "교정 검색어 생성", level: "task", status: "in_progress", dependsOn: [], parent: "search-run-typo", ref: "search-task-typo" },
];

/* ── mobile-app ───────────────────────────────────────────── */
const mobileApp = project("mobile-app");
await specFile(join(mobileApp, "docs", "specs", "offline-cart.md"), "오프라인 장바구니", "## 요구사항\n\n- 네트워크가 끊겨도 장바구니 변경을 보관하고 복구 시 동기화한다.");
const mobileRoadmap: RoadmapNode[] = [
  { id: "mobile-spec-cart", title: "오프라인 장바구니", level: "spec", status: "pending", dependsOn: [], specPath: join(mobileApp, "docs", "specs", "offline-cart.md") },
];

const tasks: Array<[string, Task]> = [
  ["payments", { id: "pay-task-guard", title: "멱등키 기반 중복 결제 차단", project: "payment-api", status: "done", priority: "high", created_at: at(-4 * DAY), completed_at: guardV1.endedAt }],
  ["payments", { id: "pay-task-webhook", title: "실패 웹훅 재처리 큐", project: "payment-api", status: "in_progress", priority: "medium", created_at: at(-1 * DAY), started_at: at(-1 * DAY) }],
  ["payments", { id: "pay-task-refund", title: "누적 환불 한도 검증", project: "payment-api", status: "in_progress", priority: "high", created_at: now, started_at: now }],
  ["search", { id: "search-task-filter", title: "필터 저장·불러오기", project: "search-api", status: "done", priority: "medium", created_at: at(-3 * DAY), completed_at: filterResult.endedAt }],
  ["search", { id: "search-task-typo", title: "교정 검색어 생성", project: "search-api", status: "in_progress", priority: "medium", created_at: now, started_at: now }],
];

for (const [name, projects] of [["payments", [payApi, project("settlement-batch")]], ["search", [searchApi]], ["mobile-app", [mobileApp]]] as const) {
  for (const path of projects) await mkdir(path, { recursive: true });
  await syncWorkspace({ name, projects: [...projects], created_at: at(-14 * DAY) });
}
for (const [workspace, task] of tasks) await syncTask(workspace, task);
await syncRoadmapSnapshot("payments", paymentsRoadmap);
await syncRoadmapSnapshot("search", searchRoadmap);
await syncRoadmapSnapshot("mobile-app", mobileRoadmap);
// 승인 화면의 "변경 파일 diff 보기"가 실제 코드를 보여주도록 검증 대상 파일을 올린다.
await syncReviewArtifacts("payments", "pay-task-webhook", "readme-demo-webhook", 0, webhookFiles);

const db = await initDb();
const dueDates: Array<[string, string, number]> = [
  ["payments", "pay-spec-guard", -3], ["payments", "pay-spec-webhook", 1], ["payments", "pay-spec-refund", 4], ["payments", "pay-spec-receipt", 9],
  ["search", "search-spec-filter", -2], ["search", "search-spec-typo", 6], ["mobile-app", "mobile-spec-cart", 12],
];
for (const [workspace, id, days] of dueDates) {
  await db.exec("UPDATE sugo_roadmap_nodes SET due_date = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [dateOnly(days), userId, workspace, id]);
}

// 작업실과 레인이 "진행 중"으로 보이도록 최근 몇 분 안의 이벤트를 넣는다.
const task = (id: string, name: string) => ({ task: { id, name } });
const events = [
  { minAgo: 40, workspace: "payments", agent: "MAIN", handoffTo: "CODE", eventType: "HANDOFF", message: "webhook-retry 구현 시작", details: task("pay-task-webhook", "실패 웹훅 재처리 큐") },
  { minAgo: 22, workspace: "payments", agent: "CODE", handoffTo: "TEST", eventType: "HANDOFF", message: "webhook-retry 구현 완료 · 2개 파일 변경", details: task("pay-task-webhook", "실패 웹훅 재처리 큐") },
  { minAgo: 9, workspace: "payments", agent: "TEST", handoffTo: "REVIEW", eventType: "HANDOFF", message: "webhook-retry 검증 완료 · 24/24 통과", details: task("pay-task-webhook", "실패 웹훅 재처리 큐") },
  { minAgo: 2, workspace: "payments", agent: "REVIEW", handoffTo: null, eventType: "EXECUTE", message: "webhook-retry 사용자 확인 요청", details: { ...task("pay-task-webhook", "실패 웹훅 재처리 큐"), stage: "user_confirmation" } },
  { minAgo: 3, workspace: "payments", agent: "MAIN", handoffTo: "CODE", eventType: "HANDOFF", message: "partial-refund 구현 시작", details: task("pay-task-refund", "누적 환불 한도 검증") },
  { minAgo: 6, workspace: "search", agent: "MAIN", handoffTo: "CODE", eventType: "HANDOFF", message: "typo-correction 구현 시작", details: task("search-task-typo", "교정 검색어 생성") },
  { minAgo: 1, workspace: "search", agent: "CODE", handoffTo: "TEST", eventType: "HANDOFF", message: "typo-correction 구현 완료 · 3개 파일 변경", details: task("search-task-typo", "교정 검색어 생성") },
] as const;
for (const event of events) {
  await ingestActivity(db, { userId, workspace: event.workspace, ts: at(-event.minAgo * 60_000), level: "AGENT", agent: event.agent, handoffTo: event.handoffTo, eventType: event.eventType, message: event.message, details: event.details });
}
await db.close();
console.log("[readme-demo] workspaces=3 specs=7 events=" + events.length);
