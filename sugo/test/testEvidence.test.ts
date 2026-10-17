import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkTestEvidenceGate,
  classifyVerifyCommand,
  deriveTestState,
  isFullVerifyCommand,
  isFullVerifyEnforceable,
  makeTestEvidenceRecord,
} from "../src/testEvidence.js";

describe("deriveTestState", () => {
  it("exitCode 0 + failed 0 -> pass", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 0, failed: 0 })).toBe("pass");
  });

  it("exitCode 0인데 failed>0이면 fail(테스트 러너가 exitCode를 잘못 반환하는 경우 방어)", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 0, failed: 2 })).toBe("fail");
  });

  it("exitCode !== 0이면 fail", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 1 })).toBe("fail");
  });

  it("unverified 플래그가 있으면 exitCode와 무관하게 unverified", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 0, unverified: true })).toBe("unverified");
  });

  it("exitCode가 아예 없으면 안전측 unverified", () => {
    expect(deriveTestState({ command: "npm test" })).toBe("unverified");
  });
});

describe("checkTestEvidenceGate — 적대적 코퍼스: 반드시 거부", () => {
  it("testPassed:true인데 record_test_evidence 자체가 없으면 거부한다", () => {
    const result = checkTestEvidenceGate(true, null);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TEST_EVIDENCE_MISSING");
  });

  it("기록이 failed>0인데 testPassed:true 주장이면 거부한다", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 1, failed: 3 }, "2026-01-01T00:00:00.000Z");
    const result = checkTestEvidenceGate(true, evidence);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TEST_EVIDENCE_MISMATCH");
  });

  it("기록이 pass인데 testPassed:false로 축소보고해도 불일치로 거부한다", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 0, failed: 0 }, "2026-01-01T00:00:00.000Z");
    const result = checkTestEvidenceGate(false, evidence);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TEST_EVIDENCE_MISMATCH");
  });
});

describe("checkTestEvidenceGate — 반드시 허용", () => {
  it("기록 exitCode==0이고 testPassed:true 주장이 일치하면 통과", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 0, failed: 0 }, "2026-01-01T00:00:00.000Z");
    expect(checkTestEvidenceGate(true, evidence).ok).toBe(true);
  });

  it("기록 fail이고 testPassed:false 주장이 일치하면 통과(auto-loop로 재시도하게 됨)", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 1, failed: 2 }, "2026-01-01T00:00:00.000Z");
    expect(checkTestEvidenceGate(false, evidence).ok).toBe(true);
  });

  it("unverified 기록이면 claim과 무관하게 통과한다(환경부재 라벨)", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", unverified: true, unverifiedReason: "샌드박스에 런타임 없음" }, "2026-01-01T00:00:00.000Z");
    expect(checkTestEvidenceGate(true, evidence).ok).toBe(true);
    expect(checkTestEvidenceGate(false, evidence).ok).toBe(true);
  });
});

describe("§4.2 풀검증 명령 분류 (classifyVerifyCommand)", () => {
  it("gradlew check / mvn verify|install만 full-verify", () => {
    expect(classifyVerifyCommand("./gradlew check")).toBe("full-verify");
    expect(classifyVerifyCommand("mvn verify")).toBe("full-verify");
    expect(classifyVerifyCommand("mvn clean install")).toBe("full-verify");
    expect(isFullVerifyCommand("./gradlew check")).toBe(true);
  });

  it("단순 test(gradlew test / mvn test)는 partial-test", () => {
    expect(classifyVerifyCommand("./gradlew test")).toBe("partial-test");
    expect(classifyVerifyCommand("mvn test")).toBe("partial-test");
    expect(isFullVerifyCommand("./gradlew test")).toBe(false);
  });

  it("npm/pytest/go는 not-enforceable(풀검증 강제 불가)", () => {
    expect(classifyVerifyCommand("npm test")).toBe("not-enforceable");
    expect(classifyVerifyCommand("pytest -q")).toBe("not-enforceable");
    expect(classifyVerifyCommand("go test ./...")).toBe("not-enforceable");
    expect(isFullVerifyEnforceable("npm test")).toBe(false);
    expect(isFullVerifyEnforceable("./gradlew test")).toBe(true);
  });
});

describe("§4.2 풀검증 명령 게이트 — 적대적 코퍼스", () => {
  const rec = (command: string) => makeTestEvidenceRecord("feature", { command, exitCode: 0, failed: 0 }, "2026-01-01T00:00:00.000Z");

  it("반드시 거부: gradle 프로젝트인데 단순 `gradlew test`로 pass 주장", () => {
    const result = checkTestEvidenceGate(true, rec("./gradlew test"));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TEST_NOT_FULL_VERIFY");
  });

  it("반드시 거부: maven `mvn test`로 pass 주장", () => {
    expect(checkTestEvidenceGate(true, rec("mvn test")).code).toBe("TEST_NOT_FULL_VERIFY");
  });

  it("반드시 허용: `gradlew check` exitCode==0 pass", () => {
    expect(checkTestEvidenceGate(true, rec("./gradlew check")).ok).toBe(true);
  });

  it("반드시 허용: `mvn verify` exitCode==0 pass", () => {
    expect(checkTestEvidenceGate(true, rec("mvn clean verify")).ok).toBe(true);
  });

  it("반드시 허용: npm은 풀검증 강제 불가라 단순 test여도 통과(미강제)", () => {
    expect(checkTestEvidenceGate(true, rec("npm test")).ok).toBe(true);
  });

  it("fail 주장이면 풀검증 여부와 무관(불일치가 아니면) 통과 — auto-loop로 감", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "./gradlew test", exitCode: 1, failed: 1 }, "2026-01-01T00:00:00.000Z");
    expect(checkTestEvidenceGate(false, evidence).ok).toBe(true);
  });
});

/**
 * ux 파라미터명(`totalTests`/`passedTests`/`failedTests`)이 정본이다. test-agent가
 * 부르는 계약이라 이름이 어긋나면 값이 조용히 undefined로 들어가 증거가 비어버린다 —
 * 짧은 이름(`total`/`passed`/`failed`)도 받되 정본 이름이 이긴다.
 */
describe("§ux record_test_evidence 파라미터명", () => {
  // `sugo_plan(start)`는 실제 세션 파일을 쓴다. HOME을 tmpdir로 갈아끼우지 않으면 사용자의
  // `~/.claude/sugo/sessions/`에 `featureName:"f"` 세션이 매 실행 3개씩 쌓인다 — 실제로 102개가
  // 쌓여 `/sugo:ws-status`의 진짜 세션을 덮어버렸다. 다른 실배선 테스트와 같은 격리를 쓴다.
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "sugo-test-evidence-home-"));
    process.env.SUGO_HOME_OVERRIDE = fakeHome;
  });

  afterEach(() => {
    delete process.env.SUGO_HOME_OVERRIDE;
    rmSync(fakeHome, { recursive: true, force: true });
  });

  async function record(args: Record<string, unknown>) {
    const { handleSugoPlan } = await import("../src/tools/sugoPlan.js");
    const { handleSugoRecordTestEvidence } = await import("../src/tools/sugoRecordTestEvidence.js");
    const { loadSession } = await import("../src/session.js");
    const started = JSON.parse(
      ((await handleSugoPlan({ action: "start", projectPath: process.cwd(), featureName: "f" })) as { content: { text: string }[] }).content[0].text,
    );
    await handleSugoRecordTestEvidence({ sessionId: started.sessionId, ...args });
    return (await loadSession(started.sessionId)).data.chainInfo.testEvidence;
  }

  it("새 이름(totalTests/passedTests/failedTests)이 기록된다", async () => {
    const ev = await record({ command: "./gradlew check", exitCode: 0, totalTests: 12, passedTests: 12, failedTests: 0 });
    expect(ev?.total).toBe(12);
    expect(ev?.passed).toBe(12);
    expect(ev?.failed).toBe(0);
  });

  it("구 이름(total/passed/failed)도 여전히 받는다(하위호환)", async () => {
    const ev = await record({ command: "npm test", exitCode: 0, total: 5, passed: 5, failed: 0 });
    expect(ev?.total).toBe(5);
  });

  it("둘 다 주면 새 이름이 이긴다", async () => {
    const ev = await record({ command: "npm test", exitCode: 0, total: 1, totalTests: 9 });
    expect(ev?.total).toBe(9);
  });
});
