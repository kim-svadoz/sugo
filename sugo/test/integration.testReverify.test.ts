import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSession, saveSession } from "../src/session.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import type { WorkflowState } from "../src/ontology/model.js";
import type { PlanSession } from "../src/types.js";
import { computeCompletionGrade } from "../src/labelGuard.js";

/**
 * 실사용 세션에서 막힌 경로를 재현한다.
 *
 * fail 증거로 `test_done`을 지나면 `testPassedState`가 fail로 박히고, 이후 올바른 그린 증거를
 * 다시 기록해도 `review_done`이 옛 판정을 보고 거부한다. forward-only라 `test_done`으로 되돌아갈
 * 수도 없어 파이프라인이 완전히 막혔다 — 결국 사용자가 sugo 밖에서 직접 커밋했다.
 */
let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-reverify-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

/**
 * 파이프라인 전 구간(start→clarify→prd→ready→baseline→code→test)을 밟으면 이 테스트의 관심사인
 * 재스냅샷 로직이 무관한 게이트 설정에 묻힌다. 그래서 세션 파일을 원하는 상태로 직접 만든다 —
 * 파일은 실제 저장소에 쓰이고 handleSugoPlan이 그대로 읽으므로 배선은 여전히 실측이다.
 */
async function seedSession(state: WorkflowState, testPassedState: "pass" | "fail" | null): Promise<string> {
  const id = `plan-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const session: PlanSession = {
    id,
    state,
    projectPath: fakeHome,
    featureName: "f",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: {
      mode: "plan",
      chainInfo: {
        changedFiles: [],
        analyzeAttempts: 1,
        analyzePassed: true,
        testPassedState,
        reviewPassed: null,
        autoLoopRetryCount: 0,
      },
    },
  } as PlanSession;
  await saveSession(session);
  return id;
}

async function recordEvidence(sessionId: string, failed: number) {
  await handleSugoRecordTestEvidence({
    sessionId,
    kind: "feature",
    // `./gradlew test`는 풀검증이 아니라 test_done이 TEST_NOT_FULL_VERIFY로 막는다("test 그린"은 증명이 아님).
    command: "./gradlew check",
    exitCode: failed > 0 ? 1 : 0,
    totalTests: 9,
    passedTests: 9 - failed,
    failedTests: failed,
  });
}

describe("§4.3-R test_reverify — 증거 스냅샷 데드락 해소", () => {
  it("기존 모듈 재스냅샷 뒤 code_start로 새 모듈을 구현하고 새 clean test_done이면 이전 라벨만 해소한다", async () => {
    const sessionId = await seedSession("REVIEW_RUNNING", "fail");
    await recordEvidence(sessionId, 0);
    await handleSugoPlan({ action: "test_reverify", sessionId, reverifyReason: "RankingModuleTest 6/6, 로컬 의존 2건 제외" });
    const restarted = parse(await handleSugoPlan({ action: "code_start", sessionId }));
    expect(restarted.ok).toBe(true);
    let session = await loadSession(sessionId);
    expect(session.data.chainInfo.implementationCycle).toBe(1);
    expect(computeCompletionGrade(session.data.chainInfo.bypassLabels!, 0).grade).toBe("unverified");
    // Advance to TEST_RUNNING with real persisted state; no unrelated harness fixtures needed.
    session.state = "TEST_RUNNING";
    await saveSession(session);
    await recordEvidence(sessionId, 0);
    expect(parse(await handleSugoPlan({ action: "test_done", sessionId, testPassed: true })).ok).toBe(true);
    session = await loadSession(sessionId);
    const label = session.data.chainInfo.bypassLabels![0];
    expect(label.reason).toContain("RankingModule");
    expect(label.supersededByCycle).toBe(1);
    expect(computeCompletionGrade(session.data.chainInfo.bypassLabels!, 0).grade).toBe("verified");
  });
  it("재진입 후 옛 그린 증거를 재사용하면 이전 라벨을 해소하지 않는다", async () => {
    const sessionId = await seedSession("REVIEW_RUNNING", "fail");
    await recordEvidence(sessionId, 0);
    await handleSugoPlan({ action: "test_reverify", sessionId, reverifyReason: "이전 구현의 재스냅샷" });
    await handleSugoPlan({ action: "code_start", sessionId });
    const session = await loadSession(sessionId);
    session.state = "TEST_RUNNING";
    session.data.chainInfo.testEvidence!.recordedAt = "2000-01-01T00:00:00Z";
    await saveSession(session);
    await handleSugoPlan({ action: "test_done", sessionId, testPassed: true });
    expect((await loadSession(sessionId)).data.chainInfo.bypassLabels![0].supersededAt).toBeUndefined();
  });
  it("fail로 찍힌 스냅샷을 그린 증거로 다시 찍으면 testPassedState가 갱신된다", async () => {
    // ① 무관한 사전 결함이 섞인 전체 스위트 실행 = fail → test_done이 fail로 박아둔 상태
    const sessionId = await seedSession("REVIEW_RUNNING", "fail");

    // ② 범위를 좁힌 재실행 = pass. 증거는 갱신되지만 스냅샷은 fail 그대로다(이게 데드락의 원인).
    await recordEvidence(sessionId, 0);
    expect((await loadSession(sessionId)).data.chainInfo.testEvidence?.derivedState).toBe("pass");
    expect((await loadSession(sessionId)).data.chainInfo.testPassedState).toBe("fail");

    // ③ test_reverify로 스냅샷을 다시 찍는다.
    const reverified = parse(
      await handleSugoPlan({ action: "test_reverify", sessionId, reverifyReason: "전체 스위트에 무관한 사전 결함이 섞여 범위를 좁혀 재실행" }),
    );
    expect(reverified.ok).toBe(true);
    expect((await loadSession(sessionId)).data.chainInfo.testPassedState).toBe("pass");
  });

  it("재스냅샷은 evidenceResnapshot 라벨로 남는다 — 조용히 넘어가지 않는다", async () => {
    const sessionId = await seedSession("REVIEW_RUNNING", "fail");
    await recordEvidence(sessionId, 0);

    await handleSugoPlan({ action: "test_reverify", sessionId, reverifyReason: "범위를 좁혀 재실행" });

    const labels = (await loadSession(sessionId)).data.chainInfo.bypassLabels ?? [];
    expect(labels.map((l) => l.kind)).toContain("evidenceResnapshot");
    expect(labels.find((l) => l.kind === "evidenceResnapshot")?.reason).toBe("범위를 좁혀 재실행");
  });

  it("상태를 바꾸지 않는다 — 기록성 액션이다", async () => {
    const sessionId = await seedSession("REVIEW_RUNNING", "fail");
    await recordEvidence(sessionId, 0);

    const before = (await loadSession(sessionId)).state;
    await handleSugoPlan({ action: "test_reverify", sessionId, reverifyReason: "범위를 좁혀 재실행" });
    expect((await loadSession(sessionId)).state).toBe(before);
  });

  it("사유 없이는 거부한다", async () => {
    const sessionId = await seedSession("REVIEW_RUNNING", "fail");
    await recordEvidence(sessionId, 0);

    const result = parse(await handleSugoPlan({ action: "test_reverify", sessionId }));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("REVERIFY_REASON_REQUIRED");
  });

  it("최신 증거도 fail이면 거부한다 — 실패를 먼저 고쳐야 한다", async () => {
    const sessionId = await seedSession("REVIEW_RUNNING", "fail");
    await recordEvidence(sessionId, 2);

    const result = parse(await handleSugoPlan({ action: "test_reverify", sessionId, reverifyReason: "그냥" }));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("REVERIFY_EVIDENCE_STILL_FAIL");
  });

  it("그린으로 test_done을 지나면 지문이 남아 reusedFromTestDone이 성립한다(보고 ②의 반증)", async () => {
    // "reusedFromTestDone이 사실상 항상 실패"는 사실이 아니다 — fail로 test_done을 지났을 때만
    // 지문이 안 남는다. 그 경우도 test_reverify로 복구된다.
    const sessionId = await seedSession("TEST_RUNNING", null);
    await recordEvidence(sessionId, 0);
    await handleSugoPlan({ action: "test_done", sessionId, testPassed: true });

    expect((await loadSession(sessionId)).data.chainInfo.testEvidenceFingerprint).toBeTruthy();
  });
});
