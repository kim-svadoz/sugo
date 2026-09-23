/** 로컬 UI 확인용 완전한 시나리오 데이터. ~/.claude/sugo 원장은 건드리지 않고 SQLite 미러에만 넣는다. */
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  syncCheckpoint,
  syncDecision,
  syncHistory,
  syncRoadmapSnapshot,
  syncTask,
  syncWorkspace,
} from "../../sugo/src/dashboard/sync.js";
import type { Checkpoint, RoadmapNode, Spec, Task, Workspace, WorkLog } from "../../sugo/src/hulk/types.js";
import { initDb } from "./src/db/init.js";
import { ingestActivity } from "./src/services/activityService.js";

const workspaceName = "tmp-sugo-showcase";
const projectPath = join(tmpdir(), "sugo-showcase", "checkout-service");
const now = new Date().toISOString();
const baseWorkResult = join(projectPath, "sugo", "features", "20260922", "checkout-guard", "work-result.md");
const patchWorkResult = join(projectPath, "sugo", "features", "20260922", "checkout-guard", "work-result-patch-v2.md");

const workspace: Workspace = { name: workspaceName, projects: [projectPath], created_at: now };
const tasks: Task[] = [
  { id: "demo-checkout", title: "결제 중복 방지", project: "checkout-service", status: "done", priority: "high", summary: "멱등키 저장과 재시도 응답을 구현했습니다.", created_at: now, completed_at: now, prd_ref: join(projectPath, "prd.md") },
  { id: "demo-webhook", title: "웹훅 재처리", project: "checkout-service", status: "in_progress", priority: "medium", description: "실패 웹훅 재처리 큐", created_at: now, started_at: now },
  { id: "demo-refund", title: "환불 승인 정책", project: "checkout-service", status: "pending", priority: "low", description: "정책 확정 대기", created_at: now },
];

const completedResult = {
  path: patchWorkResult,
  startedAt: "2026-09-22T01:10:00.000Z",
  endedAt: "2026-09-22T01:42:00.000Z",
  model: "claude-sonnet",
  summary: "중복 결제 요청을 멱등키로 차단하고, 동일 요청에는 최초 승인 결과를 재사용하도록 구현했습니다.",
  files: [
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

    public void complete(String key, String responseBody) {
        redis.opsForValue().set(key, responseBody, TTL);
    }

    public Optional<String> findCompleted(String key) {
        String value = redis.opsForValue().get(key);
        return value == null || "PROCESSING".equals(value) ? Optional.empty() : Optional.of(value);
    }
}
`,
      diff: "+ IdempotencyService 신규 생성\n+ Redis SET NX와 24시간 TTL 적용",
    },
    {
      path: "src/main/java/payment/CheckoutController.java",
      change: "modified" as const,
      content: `package payment;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/payments")
public class CheckoutController {
    private final IdempotencyService idempotency;
    private final PaymentService payments;

    public CheckoutController(IdempotencyService idempotency, PaymentService payments) {
        this.idempotency = idempotency;
        this.payments = payments;
    }

    @PostMapping("/checkout")
    public ResponseEntity<String> checkout(@RequestHeader("Idempotency-Key") String key) {
        var completed = idempotency.findCompleted(key);
        if (completed.isPresent()) return ResponseEntity.ok(completed.get());
        if (!idempotency.reserve(key)) return ResponseEntity.status(409).body("payment is processing");

        String result = payments.approve();
        idempotency.complete(key, result);
        return ResponseEntity.ok(result);
    }
}
`,
      diff: "+ Idempotency-Key 헤더 검증\n+ 완료 응답 재사용 및 처리 중 충돌 응답",
    },
    {
      path: "src/test/java/payment/CheckoutIdempotencyTest.java",
      change: "added" as const,
      content: `package payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

class CheckoutIdempotencyTest {
    @Test
    void concurrentRequestsApproveOnlyOnce() {
        String key = "checkout-order-42";
        var first = CompletableFuture.supplyAsync(() -> fixture.checkout(key));
        var second = CompletableFuture.supplyAsync(() -> fixture.checkout(key));

        CompletableFuture.allOf(first, second).join();

        verify(paymentGateway, times(1)).approve();
        assertThat(first.join().statusCode()).isIn(200, 409);
        assertThat(second.join().statusCode()).isIn(200, 409);
    }
}
`,
      diff: "+ 동시 중복 요청 회귀 테스트",
    },
  ],
  parentTaskId: "demo-checkout",
  patchVersion: 2,
  seed: "동시 요청에서도 최초 승인 한 건만 발생하게 보강",
  runtimeVerified: true,
  wiringVerified: true,
};

const lineage = [
  { version: 0, completedAt: "2026-09-20T06:00:00.000Z", title: "최초 구현", summary: "기본 멱등키 처리", changedFiles: ["CheckoutController.java"], workResult: { path: baseWorkResult, summary: "기본 멱등키 처리", patchVersion: 0 }, requirements: [{ id: "REQ-001", title: "멱등키를 저장한다", status: "done" as const }, { id: "REQ-002", title: "동일 요청은 최초 결과를 반환한다", status: "done" as const }], runtimeVerified: true, wiringVerified: true },
  { version: 1, completedAt: "2026-09-21T03:20:00.000Z", title: "Redis 만료 보강", summary: "TTL과 장애 폴백 추가", changedFiles: ["IdempotencyService.java"], workResult: { path: join(projectPath, "sugo", "features", "20260922", "checkout-guard", "work-result-patch-v1.md"), summary: "TTL과 장애 폴백 추가", patchVersion: 1 }, requirements: [{ id: "REQ-101", title: "Redis TTL을 갱신한다", status: "done" as const }, { id: "REQ-102", title: "Redis 장애 시 안전하게 폴백한다", status: "done" as const }], runtimeVerified: true, wiringVerified: true },
  { version: 2, completedAt: "2026-09-22T01:42:00.000Z", title: "동시성 패치", summary: "동시 중복 요청 회귀 방지", changedFiles: ["CheckoutIdempotencyTest.java"], workResult: completedResult, requirements: [{ id: "REQ-201", title: "동시 요청에서도 한 건만 승인한다", status: "done" as const }], seed: completedResult.seed, runtimeVerified: true, wiringVerified: true },
];

const roadmap: RoadmapNode[] = [
  { id: "demo-spec-checkout", title: "안전한 결제 처리", level: "spec", status: "done", dependsOn: [], specPath: join(projectPath, "SPEC.md") },
  { id: "demo-run-checkout", title: "결제 중복 방지", level: "workstream", status: "done", dependsOn: [], parent: "demo-spec-checkout", workResult: completedResult },
  { id: "demo-checkout", title: "멱등키 기반 중복 결제 차단", level: "task", status: "done", dependsOn: [], parent: "demo-run-checkout", ref: "demo-checkout", workResult: completedResult, lineage },
  { id: "demo-checkout::REQ-001", title: "멱등키를 저장한다", level: "subtask", status: "done", dependsOn: [], parent: "demo-checkout" },
  { id: "demo-checkout::REQ-002", title: "동일 요청은 최초 결과를 반환한다", level: "subtask", status: "done", dependsOn: ["demo-checkout::REQ-001"], parent: "demo-checkout" },
  { id: "demo-spec-ops", title: "결제 운영 안정화", level: "spec", status: "in_progress", dependsOn: [], specPath: join(projectPath, "OPS-SPEC.md") },
  { id: "demo-run-webhook", title: "웹훅 재처리", level: "workstream", status: "in_progress", dependsOn: [], parent: "demo-spec-ops" },
  { id: "demo-webhook", title: "실패 웹훅 재처리 큐", level: "task", status: "in_progress", dependsOn: [], parent: "demo-run-webhook", ref: "demo-webhook" },
  { id: "demo-webhook::REQ-001", title: "지수 백오프 재시도", level: "subtask", status: "done", dependsOn: [], parent: "demo-webhook" },
  { id: "demo-webhook::REQ-002", title: "DLQ 운영 도구", level: "subtask", status: "in_progress", dependsOn: ["demo-webhook::REQ-001"], parent: "demo-webhook" },
  { id: "demo-run-refund", title: "환불 승인 정책", level: "workstream", status: "blocked", dependsOn: [], parent: "demo-spec-ops", note: "법무 정책 확인 대기" },
  { id: "demo-refund", title: "고액 환불 이중 승인", level: "task", status: "blocked", dependsOn: [], parent: "demo-run-refund", ref: "demo-refund", note: "승인 금액 기준 미확정" },
];

const checkpoint: Checkpoint = { id: "CP-DEMO-001", title: "결제 멱등성 재발방지", category: "payment", applies_to: ["checkout-service"], checklist: ["모든 승인 API가 멱등키를 받는지 확인", "동시 요청 통합 테스트가 있는지 확인"], created_at: now };
const spec: Spec = { name: "안전한 결제 처리", type: "business-rule", tags: ["demo", "payment"], content: "# 안전한 결제 처리\n\n중복 요청은 최초 승인 결과를 재사용해야 한다.", created_at: now };
const history: WorkLog = { id: "LOG-DEMO-001", task_id: "demo-checkout", task_title: "결제 중복 방지", completed_at: now, summary: completedResult.summary, key_decisions: ["Redis SET NX를 멱등성 원장으로 사용", "응답 본문도 함께 저장"], files_changed: completedResult.files.map((file) => file.path), metrics: { estimatedHumanHours: 6, aiExecutionMinutes: 32, estimationBasis: "로컬 쇼케이스" } };

await syncWorkspace(workspace);
for (const task of tasks) await syncTask(workspaceName, task);
await syncRoadmapSnapshot(workspaceName, roadmap);
await syncCheckpoint(workspaceName, checkpoint);
await syncDecision(workspaceName, spec);
await syncHistory(workspaceName, history);

// Live Console까지 쇼케이스 한 화면에서 검증할 수 있도록 feat 파이프라인의 대표 이벤트를 심는다.
// dev-local.sh 재실행 때 같은 이벤트가 누적되지 않도록 이 워크스페이스의 데모 이벤트만 교체한다.
const db = await initDb();
const userId = process.env.LOCAL_DEV_USER_ID ?? process.env.SUGO_DASHBOARD_USER_ID ?? "local";
await db.exec("DELETE FROM sugo_activity_events WHERE user_id = ? AND workspace_name = ?", [userId, workspaceName]);
const activityFeed = [
  { minAgo: 54, level: "SYSTEM", agent: "MAIN", eventType: "EXECUTE", message: "feat 시작 · 안전한 결제 처리 SPEC/PRD 로드" },
  { minAgo: 49, level: "AGENT", agent: "MAIN", handoffTo: "CODE", eventType: "HANDOFF", message: "REQ 2건 분석 완료 → code-agent 구현 시작" },
  { minAgo: 43, level: "AGENT", agent: "CODE", eventType: "EXECUTE", message: "IdempotencyService 구현 · 변경파일 2개" },
  { minAgo: 36, level: "INFO", agent: "CODE", eventType: "EXECUTE", message: "sugo_analyze · REQ-001/REQ-002 모두 충족" },
  { minAgo: 31, level: "AGENT", agent: "CODE", handoffTo: "TEST", eventType: "HANDOFF", message: "구현 완료 → test-agent 인계" },
  { minAgo: 25, level: "AGENT", agent: "TEST", eventType: "EXECUTE", message: "동시 중복 요청 회귀 테스트 · 18 passed" },
  { minAgo: 20, level: "AGENT", agent: "TEST", handoffTo: "REVIEW", eventType: "HANDOFF", message: "전체 테스트 green → review-agent 인계" },
  { minAgo: 15, level: "AGENT", agent: "REVIEW", eventType: "EXECUTE", message: "런타임·배선·PRD 정합성 검증 완료" },
  { minAgo: 11, level: "SYSTEM", agent: "MAIN", eventType: "COMPLETED", message: "v2 patch 완료 · 동시 중복 요청 회귀 방지" },
  { minAgo: 6, level: "AGENT", agent: "CODE", eventType: "EXECUTE", message: "웹훅 재처리 큐 구현 중 · REQ 1/2 완료" },
  { minAgo: 3, level: "WARN", agent: "MAIN", eventType: "SYSTEM", message: "환불 승인 정책 blocked · 법무 기준 확인 대기" },
] as const;
for (const event of activityFeed) {
  await ingestActivity(db, {
    userId,
    workspace: workspaceName,
    ts: new Date(Date.now() - event.minAgo * 60_000).toISOString(),
    level: event.level,
    agent: event.agent,
    handoffTo: "handoffTo" in event ? event.handoffTo : null,
    eventType: event.eventType,
    message: event.message,
    details: { demo: true },
  });
}
await db.close();

console.log(`[local-demo] workspace=${workspaceName} nodes=${roadmap.length} events=${activityFeed.length} scenarios=done+patch+in_progress+blocked`);
