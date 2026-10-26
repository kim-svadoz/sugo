/**
 * README 스크린샷용 데모 데이터. readme-shots.mjs가 임시 HOME으로 띄운 Console에만 넣는다.
 * 사용자 원장(~/.claude/sugo)과 실제 Console DB는 건드리지 않는다. 회사 이름과 실제 업무 이름을 쓰지 않는다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncHistory, syncReviewArtifacts, syncRoadmapSnapshot, syncTask, syncWorkspace } from "../../sugo/src/dashboard/sync.js";
import { buildReviewConfirmationBlocker } from "../../sugo/src/reviewConfirmation.js";
import type { RoadmapNode, Task } from "../../sugo/src/work/types.js";
import { initDb } from "./src/db/init.js";
import { ingestActivity } from "./src/services/activityService.js";
import { createCheckpoint } from "./src/services/workspaceService.js";
import { createScheduleCommitment } from "./src/services/scheduleCommitmentService.js";
import { createScheduleMemo } from "./src/services/scheduleMemoService.js";
import { saveWeeklyReport } from "./src/services/weeklyReportService.js";

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

type DemoFile = { path: string; change: "added" | "modified"; content: string; diff: string };

function workResult(path: string, files: DemoFile[], title: string, summary: string, version: number, completedAt: string) {
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
const webhookResult = workResult(join(payApi, "sugo", "features", dateOnly(-1).replaceAll("-", ""), "webhook-retry", "work-result-patch-v1.md"), webhookFiles, "웹훅 재처리", "실패한 웹훅을 지수 백오프로 재시도하고 6회 실패 시 DLQ로 옮긴다.", 1, now);
const webhookV0 = { completedAt: at(-3 * DAY), summary: "실패한 웹훅을 30초 간격으로 3회 재시도한다." };

const webhookBlocker = buildReviewConfirmationBlocker({
  sessionId: "readme-demo-webhook",
  summary: "실패한 웹훅을 지수 백오프로 재시도하고, 6회 실패한 이벤트를 DLQ로 옮긴다.",
  changes: ["RetryScheduler 추가: 15초부터 두 배씩 늘어나는 재시도 간격", "6회 초과 이벤트를 DLQ로 이동"],
  tests: ["./gradlew check 24/24 통과", "백오프 간격과 DLQ 경계 테스트 추가"],
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
    { version: 1, completedAt: guardV1.endedAt, title: "동시성 보강", summary: guardV1.summary, changedFiles: guardV1.report.changedFiles, requirements: [{ id: "요구사항 2", title: "동시 요청에서 한 건만 승인한다", status: "done" as const }], seed: "동시 요청 보강", runtimeVerified: true, wiringVerified: true },
  ] },
  { id: "pay-spec-webhook", title: "웹훅 재처리", level: "spec", status: "in_progress", dependsOn: [], specPath: join(paySpec, "webhook-retry.md") },
  { id: "pay-run-webhook", title: "웹훅 재처리", level: "workstream", status: "in_progress", dependsOn: [], parent: "pay-spec-webhook" },
  { id: "pay-task-webhook", title: "실패 웹훅 재처리 큐", level: "task", status: "blocked", dependsOn: [], parent: "pay-run-webhook", ref: "pay-task-webhook", note: "검증 결과 확인 대기: 재시도 간격과 DLQ 이동 조건 승인 필요", workResult: webhookResult, humanBlocker: webhookBlocker , lineage: [{ version: 0, completedAt: webhookV0.completedAt, title: "최초 구현", summary: webhookV0.summary, changedFiles: webhookResult.report.changedFiles, workResult: { path: webhookResult.path.replace("work-result-patch-v1.md", "work-result.md"), summary: webhookV0.summary, patchVersion: 0 }, requirements: [{ id: "요구사항 1", title: "실패한 웹훅을 재시도한다", status: "done" as const }], runtimeVerified: true, wiringVerified: true }] },
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
  { id: "search-task-filter", title: "필터 저장과 불러오기", level: "task", status: "done", dependsOn: [], parent: "search-run-filter", ref: "search-task-filter", workResult: filterResult, lineage: [
    { version: 0, completedAt: filterResult.endedAt, title: "최초 구현", summary: filterResult.summary, changedFiles: filterResult.report.changedFiles, requirements: [{ id: "요구사항 1", title: "필터를 저장한다", status: "done" as const }], runtimeVerified: true, wiringVerified: true },
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


/* ── 완료 기능 카탈로그 ─────────────────────────────────────────
 * 실제 사용 규모(도메인 4, 프로젝트 9, 완료 SPEC 다수, patch 최대 4차, 작업마다 요구사항 3~5개)에 맞춘 일반 예시.
 * 기능마다 SPEC → 실행 → 작업 → 요구사항과 사용자 확인 노드와 차수별 이력, 검증 산출물, 완료 이벤트를 만든다. */
interface DemoVersion { daysAgo: number; title: string; summary: string; decisions: string[]; limits: string[]; learnings: string[]; tests: number }
interface DemoFeature { workspace: string; project: string; key: string; spec: string; task: string; due: number; reqs: string[]; file: string; versions: DemoVersion[] }

const catalog: DemoFeature[] = [
  { workspace: "payments", project: "settlement-batch", key: "settle-report", spec: "정산 리포트 내보내기", task: "가맹점별 정산 CSV 생성", due: -5, file: "src/main/java/settlement/SettlementCsvWriter.java",
    reqs: ["가맹점별 일 정산 합계를 CSV로 만든다", "환불을 같은 날 정산에서 차감한다", "1만 행 이상은 나눠 쓴다", "파일명에 정산일을 넣는다"],
    versions: [
      { daysAgo: 20, title: "최초 구현", summary: "가맹점별 일 정산 합계를 CSV로 내보낸다.", decisions: ["집계는 DB에서 끝내고 애플리케이션은 쓰기만 한다."], limits: ["대용량 가맹점의 메모리 사용량 확인이 남았다."], learnings: ["집계 책임을 한곳에 두면 금액 불일치를 추적하기 쉽다."], tests: 18 },
      { daysAgo: 14, title: "환불 차감", summary: "같은 날 환불을 정산 합계에서 차감한다.", decisions: ["환불은 원결제일이 아니라 환불일 기준으로 차감한다."], limits: [], learnings: ["금액 기준일은 SPEC에 먼저 적고 테스트 이름에 남긴다."], tests: 23 },
      { daysAgo: 9, title: "분할 쓰기", summary: "1만 행 단위로 파일을 나눠 메모리 사용량을 고정했다.", decisions: ["스트리밍 커서로 읽고 행 수 기준으로 파일을 나눈다."], limits: ["압축 전송은 다음 작업으로 남긴다."], learnings: ["대용량 출력은 처음부터 스트리밍으로 설계한다."], tests: 27 },
      { daysAgo: 6, title: "파일명 규칙", summary: "파일명에 정산일과 순번을 넣었다.", decisions: ["파일명은 settlement_yyyyMMdd_n.csv로 고정한다."], limits: [], learnings: [], tests: 28 },
    ] },
  { workspace: "payments", project: "admin-web", key: "admin-refund", spec: "관리자 환불 승인 화면", task: "환불 요청 승인과 반려", due: -4, file: "src/pages/refunds/RefundApproval.tsx",
    reqs: ["대기 중인 환불 요청을 목록으로 보여준다", "승인과 반려에 사유를 남긴다", "승인 권한이 없는 계정은 버튼을 숨긴다"],
    versions: [
      { daysAgo: 12, title: "최초 구현", summary: "환불 요청 목록과 승인, 반려 동작을 추가했다.", decisions: ["승인 권한은 서버 응답의 권한 목록으로만 판단한다."], limits: ["대량 일괄 승인은 범위 밖이다."], learnings: ["권한 판단은 화면이 아니라 서버 응답을 기준으로 한다."], tests: 14 },
      { daysAgo: 5, title: "사유 입력 필수", summary: "반려 사유를 필수로 받고 감사 로그에 남긴다.", decisions: ["사유는 5자 이상으로 검증하고 서버에서 다시 검증한다."], limits: [], learnings: [], tests: 17 },
    ] },
  { workspace: "payments", project: "payment-api", key: "coupon", spec: "쿠폰 중복 적용 방지", task: "주문당 쿠폰 1회 적용", due: -2, file: "src/main/java/coupon/CouponRedemptionService.java",
    reqs: ["한 주문에는 쿠폰을 한 번만 적용한다", "결제 취소 시 쿠폰을 복구한다", "만료된 쿠폰은 적용하지 않는다", "동시 요청에서도 한 번만 차감한다", "복구 이력을 남긴다"],
    versions: [
      { daysAgo: 25, title: "최초 구현", summary: "주문 ID 기준으로 쿠폰 적용을 한 번으로 제한했다.", decisions: ["쿠폰 사용 테이블에 주문 ID 유니크 제약을 둔다."], limits: ["결제 취소 시 복구가 없다."], learnings: ["중복 방지는 애플리케이션 검사보다 DB 제약이 확실하다."], tests: 12 },
      { daysAgo: 18, title: "취소 복구", summary: "결제 취소 시 쿠폰을 사용 가능 상태로 되돌린다.", decisions: ["복구는 취소 이벤트를 받아 처리한다."], limits: ["부분 취소는 다음 차수로 남긴다."], learnings: [], tests: 16 },
      { daysAgo: 11, title: "만료 검증", summary: "만료된 쿠폰을 적용 단계에서 거절한다.", decisions: ["만료 기준 시각은 결제 요청 시각으로 한다."], limits: [], learnings: ["시각 기준은 요청 시각과 처리 시각 중 하나로 SPEC에 고정한다."], tests: 19 },
      { daysAgo: 4, title: "동시 요청 보강", summary: "동시 요청에서도 쿠폰이 한 번만 차감되도록 보강했다.", decisions: ["차감은 조건부 UPDATE 한 번으로 끝낸다."], limits: [], learnings: ["동시성 문제는 동시 호출 통합 테스트로 재현한 뒤 고친다."], tests: 24 },
      { daysAgo: 2, title: "복구 이력", summary: "쿠폰 복구마다 사유와 주문 ID를 이력으로 남긴다.", decisions: ["이력은 기존 감사 로그 형식을 재사용한다."], limits: ["이력 조회 화면은 다음 작업으로 남긴다."], learnings: [], tests: 26 },
    ] },
  { workspace: "search", project: "search-indexer", key: "popular", spec: "인기 검색어 집계", task: "시간대별 인기 검색어", due: -3, file: "src/aggregate/popular_terms.ts",
    reqs: ["1시간 단위로 검색어 빈도를 집계한다", "금칙어를 집계에서 뺀다", "상위 10개를 캐시에 둔다"],
    versions: [
      { daysAgo: 16, title: "최초 구현", summary: "1시간 단위 검색어 빈도 집계를 추가했다.", decisions: ["집계는 기존 색인 파이프라인 뒤에 붙인다."], limits: ["금칙어 처리가 없다."], learnings: ["새 파이프라인을 만들기 전에 기존 단계에 붙일 수 있는지 본다."], tests: 11 },
      { daysAgo: 3, title: "금칙어 제외", summary: "금칙어를 집계에서 빼고 상위 10개를 캐시에 둔다.", decisions: ["금칙어 목록은 설정 파일로 관리한다."], limits: [], learnings: [], tests: 15 },
    ] },
  { workspace: "mobile-app", project: "push-gateway", key: "push-settings", spec: "푸시 수신 설정", task: "카테고리별 푸시 수신 동의", due: -1, file: "src/push/PreferenceRepository.kt",
    reqs: ["카테고리별로 수신 여부를 저장한다", "야간 수신 거부 시간을 지킨다", "동의 변경 이력을 남긴다", "기존 전체 동의를 카테고리로 옮긴다"],
    versions: [
      { daysAgo: 19, title: "최초 구현", summary: "카테고리별 푸시 수신 여부를 저장한다.", decisions: ["설정은 사용자별 한 행에 카테고리 비트로 저장한다."], limits: ["기존 전체 동의 이전이 남았다."], learnings: [], tests: 13 },
      { daysAgo: 10, title: "야간 수신 거부", summary: "21시부터 8시까지 광고성 푸시를 보내지 않는다.", decisions: ["시간 판단은 사용자 시간대 기준으로 한다."], limits: [], learnings: ["시간 규칙은 서버 시간대가 아니라 사용자 시간대로 테스트한다."], tests: 18 },
      { daysAgo: 1, title: "기존 동의 이전", summary: "기존 전체 동의를 모든 카테고리 동의로 옮겼다.", decisions: ["이전은 한 번만 실행되는 마이그레이션으로 둔다."], limits: ["이전 결과 점검 리포트는 다음 작업으로 남긴다."], learnings: [], tests: 21 },
    ] },
  { workspace: "account", project: "account-api", key: "login-lock", spec: "로그인 실패 잠금", task: "5회 실패 시 10분 잠금", due: -6, file: "src/main/java/account/LoginAttemptService.java",
    reqs: ["로그인 실패를 계정별로 센다", "5회 실패하면 10분 동안 잠근다", "성공하면 실패 횟수를 초기화한다"],
    versions: [
      { daysAgo: 22, title: "최초 구현", summary: "로그인 5회 실패 시 계정을 10분 동안 잠근다.", decisions: ["실패 횟수는 Redis에 TTL과 함께 저장한다."], limits: ["IP 기준 제한은 범위 밖이다."], learnings: [], tests: 15 },
      { daysAgo: 8, title: "잠금 안내", summary: "잠긴 계정에 남은 잠금 시간을 응답에 담는다.", decisions: ["남은 시간은 초 단위로 내려준다."], limits: [], learnings: ["오류 응답에는 사용자가 다음에 할 일을 담는다."], tests: 18 },
    ] },
  { workspace: "account", project: "auth-gateway", key: "pw-reset", spec: "비밀번호 재설정 메일", task: "재설정 링크 발송", due: 1, file: "src/reset/ResetTokenService.ts",
    reqs: ["재설정 링크는 30분 뒤 만료된다", "링크는 한 번만 쓸 수 있다", "같은 계정의 이전 링크는 무효로 한다"],
    versions: [
      { daysAgo: 0, title: "최초 구현", summary: "30분 만료, 1회용 재설정 링크를 메일로 보낸다.", decisions: ["토큰은 해시만 저장한다."], limits: ["메일 발송 실패 재시도는 다음 작업으로 남긴다."], learnings: ["보안 토큰은 원문을 저장하지 않는다."], tests: 20 },
    ] },
];

const reviewFile = (path: string, summary: string) => [{ path, change: "modified" as const, content: `// ${summary}\n`, diff: `@@ -1,1 +1,1 @@\n-// TODO\n+// ${summary}\n` }];
const catalogRoadmaps = new Map<string, RoadmapNode[]>();
const catalogTasks: Array<[string, Task]> = [];
const catalogEvents: Array<{ ts: string; workspace: string; agent: string; handoffTo: string | null; eventType: string; message: string; details: Record<string, unknown> }> = [];
const catalogArtifacts: Array<[string, string, string, number, ReturnType<typeof reviewFile>]> = [];

for (const feature of catalog) {
  const projectPath = project(feature.project);
  const specPath = join(projectPath, "docs", "specs", `${feature.key}.md`);
  await specFile(specPath, feature.spec, `## 요구사항\n\n${feature.reqs.map((req) => `- ${req}`).join("\n")}`);
  const taskId = `${feature.workspace}-task-${feature.key}`;
  const results = feature.versions.map((version, index) => {
    const completedAt = at(-version.daysAgo * DAY - (2 + index % 3) * 3_600_000);
    const dir = join(projectPath, "sugo", "features", completedAt.slice(0, 10).replaceAll("-", ""), feature.key);
    const result = workResult(join(dir, index === 0 ? "work-result.md" : `work-result-patch-v${index}.md`), reviewFile(feature.file, version.summary), feature.spec, version.summary, index, completedAt);
    result.report.designDecisions = version.decisions;
    result.report.knownLimitations = version.limits;
    result.report.learnings = version.learnings;
    result.report.requirements = feature.reqs.map((_, req) => ({ id: `요구사항 ${req + 1}`, covered: true }));
    result.report.verification.test = { command: "npm test", state: "pass" as const, total: version.tests, passed: version.tests, failed: 0 };
    return { version, result, completedAt };
  });
  const last = results[results.length - 1].result;
  const nodes = catalogRoadmaps.get(feature.workspace) ?? [];
  nodes.push(
    { id: `${feature.workspace}-spec-${feature.key}`, title: feature.spec, level: "spec", status: "done", dependsOn: [], specPath },
    { id: `${feature.workspace}-run-${feature.key}`, title: feature.spec, level: "workstream", status: "done", dependsOn: [], parent: `${feature.workspace}-spec-${feature.key}`, workResult: last },
    { id: taskId, title: feature.task, level: "task", status: "done", dependsOn: [], parent: `${feature.workspace}-run-${feature.key}`, ref: taskId, workResult: last,
      lineage: results.map(({ version, result, completedAt }, index) => ({
        version: index, completedAt, title: version.title, summary: version.summary, changedFiles: [feature.file],
        // 최신 차수는 workResult를 비워 화면이 작업의 전체 보고서(설계 판단 포함)를 읽게 한다.
        ...(index < results.length - 1 ? { workResult: { path: result.path, summary: version.summary, patchVersion: index } } : {}),
        requirements: feature.reqs.map((title, req) => ({ id: `요구사항 ${req + 1}`, title, status: "done" as const })),
        runtimeVerified: true, wiringVerified: true,
      })) },
    ...feature.reqs.map((title, req) => ({ id: `${taskId}::REQ-${req + 1}`, title, level: "subtask" as const, status: "done" as const, dependsOn: [], parent: taskId })),
    { id: `${taskId}::REQ-CONFIRM`, title: "사용자 확인", level: "step", status: "done", dependsOn: [], parent: taskId },
  );
  catalogRoadmaps.set(feature.workspace, nodes);
  catalogTasks.push([feature.workspace, { id: taskId, title: feature.task, project: feature.project, status: "done", priority: "medium", created_at: at(-(feature.versions[0].daysAgo + 1) * DAY), completed_at: results[results.length - 1].completedAt }]);
  for (const [index, { completedAt }] of results.entries()) {
    catalogArtifacts.push([feature.workspace, taskId, `demo-${feature.key}-${index}`, index, reviewFile(feature.file, feature.versions[index].summary)]);
    const end = Date.parse(completedAt);
    const details = { task: { id: taskId, name: feature.key } };
    const flow: Array<[number, string, string | null, string, string]> = [
      [70, "MAIN", "CODE", "HANDOFF", `${feature.key} 구현 시작`],
      [48, "CODE", "TEST", "HANDOFF", `${feature.key} 구현 완료`],
      [33, "TEST", "REVIEW", "HANDOFF", `${feature.key} 테스트 ${feature.versions[index].tests}/${feature.versions[index].tests} 통과`],
      [20, "REVIEW", "DOCS", "HANDOFF", `${feature.key} 검증 완료, 사용자 승인`],
      [8, "DOCS", "MAIN", "HANDOFF", `${feature.key} 문서 갱신`],
      [0, "MAIN", null, "COMPLETED", [feature.versions[index].summary, ...feature.versions[index].decisions, `테스트 ${feature.versions[index].tests}건 통과.`].join("\n")],
    ];
    for (const [minutesBefore, agent, handoffTo, eventType, message] of flow) {
      catalogEvents.push({ ts: new Date(end - minutesBefore * 60_000).toISOString(), workspace: feature.workspace, agent, handoffTo, eventType, message, details });
    }
  }
}

/* account 대기 SPEC: 이후 일정으로 남는 기능 */
await specFile(join(project("account-api"), "docs", "specs", "two-factor.md"), "2단계 인증", "## 요구사항\n\n- 앱 OTP로 2단계 인증을 켠다.\n- 복구 코드 10개를 발급한다.");
catalogRoadmaps.set("account", [...(catalogRoadmaps.get("account") ?? []), { id: "account-spec-2fa", title: "2단계 인증", level: "spec", status: "pending", dependsOn: [], specPath: join(project("account-api"), "docs", "specs", "two-factor.md") }]);

const tasks: Array<[string, Task]> = [
  ["payments", { id: "pay-task-guard", title: "멱등키 기반 중복 결제 차단", project: "payment-api", status: "done", priority: "high", created_at: at(-4 * DAY), completed_at: guardV1.endedAt }],
  ["payments", { id: "pay-task-webhook", title: "실패 웹훅 재처리 큐", project: "payment-api", status: "in_progress", priority: "medium", created_at: at(-1 * DAY), started_at: at(-1 * DAY) }],
  ["payments", { id: "pay-task-refund", title: "누적 환불 한도 검증", project: "payment-api", status: "in_progress", priority: "high", created_at: now, started_at: now }],
  ["search", { id: "search-task-filter", title: "필터 저장과 불러오기", project: "search-api", status: "done", priority: "medium", created_at: at(-3 * DAY), completed_at: filterResult.endedAt }],
  ["search", { id: "search-task-typo", title: "교정 검색어 생성", project: "search-api", status: "in_progress", priority: "medium", created_at: now, started_at: now }],
];

for (const [name, projects] of [["payments", [payApi, project("settlement-batch"), project("admin-web")]], ["search", [searchApi, project("search-indexer")]], ["mobile-app", [mobileApp, project("push-gateway")]], ["account", [project("account-api"), project("auth-gateway")]]] as const) {
  for (const path of projects) await mkdir(path, { recursive: true });
  await syncWorkspace({ name, projects: [...projects], created_at: at(-14 * DAY) });
}
for (const [workspace, task] of [...tasks, ...catalogTasks]) await syncTask(workspace, task);
await syncRoadmapSnapshot("payments", [...paymentsRoadmap, ...(catalogRoadmaps.get("payments") ?? [])]);
await syncRoadmapSnapshot("search", [...searchRoadmap, ...(catalogRoadmaps.get("search") ?? [])]);
await syncRoadmapSnapshot("mobile-app", [...mobileRoadmap, ...(catalogRoadmaps.get("mobile-app") ?? [])]);
await syncRoadmapSnapshot("account", catalogRoadmaps.get("account") ?? []);
for (const [workspace, taskId, sessionId, version, files] of catalogArtifacts) await syncReviewArtifacts(workspace, taskId, sessionId, version, files);
const commitId = (seed: string) => [...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7).toString(16).padStart(7, "0").slice(0, 7);
for (const feature of catalog) {
  for (const [index, version] of feature.versions.entries()) {
    const taskId = `${feature.workspace}-task-${feature.key}`;
    await syncHistory(feature.workspace, { id: `${taskId}-v${index}`, task_id: taskId, task_title: index === 0 ? feature.task : `${feature.task}: ${version.title}`, completed_at: at(-version.daysAgo * DAY - (2 + index % 3) * 3_600_000),
      summary: version.summary, key_decisions: version.decisions, files_changed: [feature.file], commits: [`${commitId(`${taskId}-${index}`)} ${index === 0 ? "feat" : "fix"}: ${version.title}`] });
  }
}
await syncHistory("payments", { id: "pay-task-guard-v0", task_id: "pay-task-guard", task_title: "멱등키 기반 중복 결제 차단", completed_at: guardV0.endedAt, summary: guardV0.summary, key_decisions: guardV0.report.designDecisions, files_changed: guardV0.report.changedFiles, commits: ["3f9a1c2 feat: 멱등키 기반 중복 결제 차단"] });
await syncHistory("payments", { id: "pay-task-guard-v1", task_id: "pay-task-guard", task_title: "멱등키 기반 중복 결제 차단: 동시성 보강", completed_at: guardV1.endedAt, summary: guardV1.summary, key_decisions: guardV1.report.designDecisions, files_changed: guardV1.report.changedFiles, commits: ["8b20d4e fix: 동시 요청 승인 1건 보장"] });
await syncHistory("payments", { id: "pay-task-webhook-v0", task_id: "pay-task-webhook", task_title: "실패 웹훅 재처리 큐", completed_at: webhookV0.completedAt, summary: webhookV0.summary, key_decisions: ["재시도는 기존 이벤트 테이블의 상태 컬럼으로 관리한다."], files_changed: webhookResult.report.changedFiles, commits: ["c41e7a0 feat: 실패 웹훅 재시도"] });
await syncHistory("search", { id: "search-task-filter-v0", task_id: "search-task-filter", task_title: "필터 저장과 불러오기", completed_at: filterResult.endedAt, summary: filterResult.summary, key_decisions: filterResult.report.designDecisions, files_changed: filterResult.report.changedFiles, commits: ["5d6e0b9 feat: 검색 필터 저장"] });
// 승인 화면의 "변경 파일 diff 보기"가 실제 코드를 보여주도록 검증 대상 파일을 올린다.
await syncReviewArtifacts("payments", "pay-task-webhook", "readme-demo-webhook", 1, webhookFiles);

const db = await initDb();
const dueDates: Array<[string, string, number]> = [
  ["payments", "pay-spec-guard", -3], ["payments", "pay-spec-webhook", 1], ["payments", "pay-spec-refund", 4], ["payments", "pay-spec-receipt", 9],
  ["search", "search-spec-filter", -2], ["search", "search-spec-typo", 6], ["mobile-app", "mobile-spec-cart", 12],
  ...catalog.map((feature): [string, string, number] => [feature.workspace, `${feature.workspace}-spec-${feature.key}`, feature.due]),
  ["account", "account-spec-2fa", 15],
];
for (const [workspace, id, days] of dueDates) {
  await db.exec("UPDATE sugo_roadmap_nodes SET due_date = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [dateOnly(days), userId, workspace, id]);
}

// 작업실과 레인이 "진행 중"으로 보이도록 최근 몇 분 안의 이벤트를 넣는다.
const task = (id: string, name: string) => ({ task: { id, name } });
const events = [
  { minAgo: 40, workspace: "payments", agent: "MAIN", handoffTo: "CODE", eventType: "HANDOFF", message: "webhook-retry 구현 시작", details: task("pay-task-webhook", "실패 웹훅 재처리 큐") },
  { minAgo: 22, workspace: "payments", agent: "CODE", handoffTo: "TEST", eventType: "HANDOFF", message: "webhook-retry 구현 완료, 2개 파일 변경", details: task("pay-task-webhook", "실패 웹훅 재처리 큐") },
  { minAgo: 9, workspace: "payments", agent: "TEST", handoffTo: "REVIEW", eventType: "HANDOFF", message: "webhook-retry 검증 완료, 24/24 통과", details: task("pay-task-webhook", "실패 웹훅 재처리 큐") },
  { minAgo: 2, workspace: "payments", agent: "REVIEW", handoffTo: null, eventType: "EXECUTE", message: "webhook-retry 사용자 확인 요청", details: { ...task("pay-task-webhook", "실패 웹훅 재처리 큐"), stage: "user_confirmation" } },
  { minAgo: 3, workspace: "payments", agent: "MAIN", handoffTo: "CODE", eventType: "HANDOFF", message: "partial-refund 구현 시작", details: task("pay-task-refund", "누적 환불 한도 검증") },
  { minAgo: 6, workspace: "search", agent: "MAIN", handoffTo: "CODE", eventType: "HANDOFF", message: "typo-correction 구현 시작", details: task("search-task-typo", "교정 검색어 생성") },
  { minAgo: 1, workspace: "search", agent: "CODE", handoffTo: "TEST", eventType: "HANDOFF", message: "typo-correction 구현 완료, 3개 파일 변경", details: task("search-task-typo", "교정 검색어 생성") },
] as const;
// 웹훅 최초 구현의 완료 흐름. 지금 진행 중인 PATCH 1의 이전 완료 기록이 된다.
for (const [minutesBefore, agent, handoffTo, eventType, message] of [
  [70, "MAIN", "CODE", "HANDOFF", "webhook-retry 구현 시작"], [45, "CODE", "TEST", "HANDOFF", "webhook-retry 구현 완료"], [30, "TEST", "REVIEW", "HANDOFF", "webhook-retry 테스트 18/18 통과"],
  [18, "REVIEW", "DOCS", "HANDOFF", "webhook-retry 검증 완료, 사용자 승인"], [7, "DOCS", "MAIN", "HANDOFF", "webhook-retry 문서 갱신"],
  [0, "MAIN", null, "COMPLETED", "실패한 웹훅을 30초 간격으로 3회 재시도한다.\n재시도 상태는 기존 이벤트 테이블의 상태 컬럼으로 관리한다.\n테스트 18건 통과."],
] as const) {
  catalogEvents.push({ ts: new Date(Date.parse(webhookV0.completedAt) - minutesBefore * 60_000).toISOString(), workspace: "payments", agent, handoffTo, eventType, message, details: { task: { id: "pay-task-webhook", name: "실패 웹훅 재처리 큐" } } });
}
for (const event of catalogEvents) {
  await ingestActivity(db, { userId, workspace: event.workspace, ts: event.ts, level: "AGENT", agent: event.agent, handoffTo: event.handoffTo, eventType: event.eventType, message: event.message, details: event.details });
}
for (const event of events) {
  await ingestActivity(db, { userId, workspace: event.workspace, ts: at(-event.minAgo * 60_000), level: "AGENT", agent: event.agent, handoffTo: event.handoffTo, eventType: event.eventType, message: event.message, details: event.details });
}
// 도메인 규칙: 같은 도메인의 모든 작업이 같은 맥락과 규약을 따르게 하는 기록. 도메인 전체용 1건과 프로젝트 전용 2건.
const checkpoints = [
  { id: "cp-pay-money", category: "결제 규칙", title: "금액은 원 단위 정수(long)로만 계산한다", appliesTo: [],
    learnedFrom: "부분 환불에서 double 계산으로 1원 오차가 났다.\n\n- 금액 필드와 계산은 `long`(원 단위)을 쓴다\n- 비율 계산은 마지막에 한 번만 반올림한다\n- 테스트에 0원과 최대 한도 경계를 넣는다" },
  { id: "cp-pay-idempotency", category: "외부 연동", title: "PG 승인과 취소 요청에는 멱등키를 항상 붙인다", appliesTo: ["payment-api"],
    learnedFrom: "타임아웃 재시도에서 승인이 두 번 났다.\n\n- 요청마다 주문 ID 기반 멱등키를 만든다\n- 재시도는 같은 멱등키로만 한다\n- 멱등키 충돌 테스트를 포함한다" },
  { id: "cp-settle-kst", category: "배치", title: "정산 배치는 KST 자정 경계를 테스트한다", appliesTo: ["settlement-batch"],
    learnedFrom: "UTC 기준 집계로 23시 결제가 다음 날 정산에 들어갔다.\n\n- 집계 기간은 Asia/Seoul로 자른다\n- 23:59:59와 00:00:00 경계 테스트를 둔다" },
];
const moreCheckpoints: Array<[string, { id: string; category: string; title: string; appliesTo: string[]; learnedFrom: string }]> = [
  ["payments", { id: "cp-pay-refund-date", category: "결제 규칙", title: "환불은 환불일 기준으로 정산한다", appliesTo: ["settlement-batch"], learnedFrom: "원결제일 기준 차감으로 지난 정산 파일이 바뀌었다.\n\n- 환불은 환불이 일어난 날의 정산에서 차감한다\n- 지난 정산 파일은 다시 만들지 않는다" }],
  ["payments", { id: "cp-pay-coupon-once", category: "결제 규칙", title: "한 번만 차감하는 값은 조건부 UPDATE로 바꾼다", appliesTo: [], learnedFrom: "읽고 쓰는 두 단계 사이에 동시 요청이 끼어들었다.\n\n- WHERE 절에 현재 상태를 넣는다\n- 바뀐 행 수가 0이면 실패로 처리한다" }],
  ["payments", { id: "cp-pay-pg-timeout", category: "외부 연동", title: "PG 타임아웃은 승인 조회로 결과를 확인한다", appliesTo: ["payment-api"], learnedFrom: "타임아웃을 실패로 보고 재시도해 이중 승인이 났다.\n\n- 타임아웃이면 먼저 승인 조회 API를 부른다\n- 조회 결과가 없을 때만 재시도한다" }],
  ["payments", { id: "cp-pay-webhook-sign", category: "외부 연동", title: "웹훅은 서명을 확인한 뒤 처리한다", appliesTo: ["payment-api"], learnedFrom: "서명 없는 요청이 상태를 바꿀 수 있었다.\n\n- 서명 검증 실패는 400으로 끝낸다\n- 검증 전에는 본문을 파싱하지 않는다" }],
  ["payments", { id: "cp-pay-admin-audit", category: "운영", title: "관리자 화면의 상태 변경은 사유와 함께 감사 로그에 남긴다", appliesTo: ["admin-web"], learnedFrom: "환불 반려 사유를 나중에 확인할 수 없었다.\n\n- 변경 사유를 필수로 받는다\n- 감사 로그 형식을 새로 만들지 않고 재사용한다" }],
  ["account", { id: "cp-account-token-hash", category: "보안", title: "보안 토큰은 해시만 저장한다", appliesTo: [], learnedFrom: "DB 백업에 재설정 토큰 원문이 남았다.\n\n- 토큰은 SHA-256 해시로만 저장한다\n- 로그에도 원문을 쓰지 않는다" }],
  ["account", { id: "cp-account-lock-redis", category: "보안", title: "실패 횟수 같은 임시 상태는 TTL과 함께 저장한다", appliesTo: ["account-api"], learnedFrom: "잠금 해제 배치가 멈춰 계정이 계속 잠겨 있었다.\n\n- 만료가 필요한 상태는 TTL로 끝낸다\n- 해제 배치에 의존하지 않는다" }],
  ["search", { id: "cp-search-config", category: "운영", title: "금칙어 같은 운영 목록은 코드가 아니라 설정으로 둔다", appliesTo: [], learnedFrom: "금칙어 하나를 바꾸려고 배포했다.\n\n- 운영 목록은 설정 파일로 관리한다\n- 변경 이력을 남긴다" }],
];
for (const checkpoint of checkpoints) await createCheckpoint(db, userId, "payments", { ...checkpoint, checkpointDate: dateOnly(-5) });
for (const [workspace, checkpoint] of moreCheckpoints) await createCheckpoint(db, userId, workspace, { ...checkpoint, checkpointDate: dateOnly(-3) });

// 주간 보고서: Weekly 화면이 비지 않도록 최근 4주치를 넣는다. 형식은 Weekly 엔진이 Console에 올리는 report JSON과 같다.
function isoWeek(date: Date): { id: string; start: string; end: string } {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7)));
  const thursday = new Date(monday.getTime() + 3 * DAY);
  const week = Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  return { id: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, start: monday.toISOString().slice(0, 10), end: new Date(monday.getTime() + 6 * DAY).toISOString().slice(0, 10) };
}
const weeklyTopics = [
  [{ title: "쿠폰 중복 적용 방지", workspace: "payments", category: "기능", one_line: "동시 요청에서도 쿠폰이 한 번만 차감된다.", context: "쿠폰이 같은 주문에 두 번 적용되는 문의가 있었다.", goal: "주문당 쿠폰 1회 적용을 DB 제약과 조건부 차감으로 보장한다.", done: ["주문 ID 유니크 제약 추가", "조건부 UPDATE로 차감", "복구 이력 기록"], results: ["동시 호출 통합 테스트 26건 통과"], todo: [{ text: "복구 이력 조회 화면", kind: "작업" }] },
    { title: "푸시 수신 설정", workspace: "mobile-app", category: "기능", one_line: "카테고리별 동의와 야간 수신 거부를 적용했다.", context: "전체 동의 하나로는 광고 수신을 나눠 받을 수 없었다.", goal: "카테고리별 동의와 야간 시간 규칙을 지킨다.", done: ["카테고리별 동의 저장", "사용자 시간대 기준 야간 거부", "기존 동의 이전"], results: ["이전 마이그레이션 1회 실행 확인"], todo: [{ text: "이전 결과 점검 리포트", kind: "확인" }] },
    { title: "비밀번호 재설정 메일", workspace: "account", category: "보안", one_line: "30분 만료, 1회용 재설정 링크를 보낸다.", context: "재설정 링크가 만료 없이 재사용될 수 있었다.", goal: "토큰 원문을 저장하지 않고 1회만 쓰게 한다.", done: ["토큰 해시 저장", "이전 링크 무효화"], results: ["보안 테스트 20건 통과"], todo: [{ text: "메일 발송 실패 재시도 방식", kind: "결정 필요" }] }],
  [{ title: "정산 리포트 분할 쓰기", workspace: "payments", category: "성능", one_line: "1만 행 단위로 파일을 나눠 메모리 사용량을 고정했다.", context: "대형 가맹점 정산 파일 생성 중 메모리가 급증했다.", goal: "행 수와 관계없이 일정한 메모리로 파일을 만든다.", done: ["스트리밍 커서로 읽기", "1만 행 단위 분할"], results: ["10만 행 기준 메모리 사용량 일정"], todo: [{ text: "압축 전송", kind: "작업" }] },
    { title: "로그인 잠금 안내", workspace: "account", category: "기능", one_line: "잠긴 계정에 남은 잠금 시간을 알려준다.", context: "잠금 후 언제 다시 시도할지 알 수 없었다.", goal: "오류 응답에 다음 행동을 담는다.", done: ["남은 시간을 초 단위로 응답"], results: ["테스트 18건 통과"], todo: [] }],
];
const weeklyTech = { learning_summary: ["중복 방지는 애플리케이션 검사보다 DB 제약이 확실하다.", "대용량 출력은 처음부터 스트리밍으로 설계한다.", "시간 규칙은 사용자 시간대로 테스트한다."],
  items: [
    { name: "조건부 UPDATE", category: "데이터베이스", level: "실무", definition: "조건을 만족할 때만 값을 바꾸고, 바뀐 행 수로 성공을 판단하는 갱신 방식이다.", topics: ["쿠폰 중복 적용 방지"], key_points: ["읽고 쓰는 두 단계를 한 문장으로 합친다.", "바뀐 행 수가 0이면 이미 처리된 요청이다."], how_it_works: ["WHERE 절에 현재 상태 조건을 넣는다.", "DB가 행 잠금 안에서 조건을 확인하고 갱신한다."], example: ["UPDATE coupon SET used = 1 WHERE id = ? AND used = 0"], when_to_use: ["재고, 쿠폰처럼 한 번만 차감해야 하는 값"], when_not_to_use: ["여러 테이블을 함께 바꿔야 하는 경우"], pitfalls: ["바뀐 행 수를 확인하지 않으면 실패를 놓친다."], alternatives: [{ name: "비관적 잠금", pros: "흐름이 단순하다.", cons: "대기가 길어진다.", when: "갱신 경로가 길 때" }], complements: [{ name: "유니크 제약", why: "중복 삽입을 DB가 막는다." }], rationale_recorded: [{ text: "동시 요청에서 차감이 두 번 일어나는 문제를 막으려고 선택했다." }], rationale_unverified: [], rationale_general: "", quiz: [{ q: "바뀐 행 수가 0이면 무엇을 뜻하나?", a: "조건이 이미 바뀌어 다른 요청이 먼저 처리했다." }], keywords: ["동시성", "원자적 갱신"] },
    { name: "스트리밍 커서", category: "데이터 처리", level: "실무", definition: "결과를 한 번에 메모리에 올리지 않고 일정 크기씩 읽는 방식이다.", topics: ["정산 리포트 분할 쓰기"], key_points: ["메모리 사용량이 결과 크기와 무관해진다."], how_it_works: ["DB 드라이버가 fetch size만큼 행을 나눠 가져온다."], example: ["fetchSize 1000으로 정산 행을 읽어 바로 파일에 쓴다."], when_to_use: ["행 수를 예측할 수 없는 내보내기"], when_not_to_use: ["결과를 여러 번 다시 읽어야 할 때"], pitfalls: ["트랜잭션을 너무 오래 열어 둔다."], alternatives: [{ name: "페이지 단위 조회", pros: "구현이 쉽다.", cons: "중간에 데이터가 바뀌면 누락된다.", when: "데이터 변경이 없을 때" }], complements: [], rationale_recorded: [{ text: "대형 가맹점 정산에서 메모리가 급증해 도입했다." }], rationale_unverified: [], rationale_general: "", quiz: [{ q: "스트리밍 커서를 쓸 때 주의할 점은?", a: "트랜잭션과 연결을 오래 붙잡지 않게 한다." }], keywords: ["대용량", "메모리"] },
  ] };
for (let back = 1; back <= 4; back += 1) {
  const week = isoWeek(new Date(Date.now() - back * 7 * DAY));
  const topics = weeklyTopics[back % weeklyTopics.length];
  await saveWeeklyReport(db, userId, { weekId: week.id, start: week.start, end: week.end, generatedAt: at(-(back * 7 - 1) * DAY),
    report: { headline: topics.map((topic) => topic.one_line), topics, next_week: [{ text: "부분 환불 API 마무리" }, { text: "오타 교정 제안 사용자 확인" }], blocked: back === 1 ? [{ text: "메일 발송 실패 재시도 방식 결정 대기" }] : [], last_week_plan: [{ text: "쿠폰 동시 요청 보강", status: "완료" }, { text: "정산 압축 전송", status: "진행" }], tech: weeklyTech } });
}

// 일정 메모와 약속: Schedule의 메모 탭과 일정 카드가 실제 사용처럼 차 있게 한다.
const memos: Array<[string, string, number | null]> = [
  ["정산 압축 전송 방식", "- gzip과 zip 중 가맹점 요청 형식 확인\n- 전송 실패 시 재시도 횟수", 6],
  ["2단계 인증 범위", "- 앱 OTP만 먼저\n- SMS는 다음 분기", 10],
  ["검색 금칙어 목록 갱신", "- 운영팀 목록 반영 주기 정하기", 3],
  ["푸시 이전 결과 점검", "- 카테고리 동의 수와 기존 전체 동의 수 비교", 2],
  ["환불 승인 권한 정리", "- 승인 권한 역할 이름 통일", null],
  ["회고 메모", "- 동시성 문제는 통합 테스트로 먼저 재현한다", null],
];
for (const [title, contentMd, due] of memos) await createScheduleMemo(db, userId, { title, contentMd, dueDate: due === null ? null : dateOnly(due) });
await createScheduleCommitment(db, userId, { workspaceName: "payments", specId: "pay-spec-refund", title: "부분 환불 STG 반영", dueDate: dateOnly(3), target: "stg", state: "active" });
await createScheduleCommitment(db, userId, { workspaceName: "account", specId: "account-spec-2fa", title: "2단계 인증 범위 확정", dueDate: dateOnly(8), target: "custom" });
await db.close();
console.log(`[readme-demo] workspaces=4 specs=${7 + catalog.length + 1} events=${events.length + catalogEvents.length} checkpoints=${checkpoints.length + moreCheckpoints.length}`);
