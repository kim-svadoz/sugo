import { fail, ok, type GateCheckResult } from "./gates.js";

export type TestEvidenceKind = "baseline" | "feature";
export type TestPassedState = "pass" | "fail" | "unverified";

/**
 * 풀검증 명령 분류: gradle/maven은 "풀검증 명령"(gradlew check / mvn verify|install)을 강제할
 * 수 있고, 단순 test(gradlew test / mvn test)는 "그린이어도 증명 아님"으로 거부한다. npm/pytest/go
 * 등은 풀검증 개념을 강제할 수 없어 not-enforceable — 통과시키되 "정적검증 미강제"로 표시한다.
 */
export type VerifyCommandKind = "full-verify" | "partial-test" | "not-enforceable";

const GRADLE_LAUNCHER = /^gradlew?(?:\.bat|\.exe)?$/i;
const MAVEN_LAUNCHER = /^(?:mvnw?|maven)(?:\.cmd|\.bat|\.exe)?$/i;
const GRADLE_LIMIT = /^(?:--tests?|--exclude-task|--dry-run|--task-graph|--help|--version|--project-dir|--include-build|--build-file|--settings-file|--init-script)(?:=|$)|^-(?:x|m|h|v|p|b|c|I)/;
const MAVEN_LIMIT = /^(?:--projects|--resume-from|--non-recursive|--file|--fail-never|--help|--version|-(?:pl|rf|N|f|fn|h|v))(?:=|$)/;
const MAVEN_TEST_FILTER = /^-D(?:test|it\.test|(?:surefire|failsafe)\.(?:includes|excludes))(?:=|$)/i;
const MAVEN_TEST_SKIP = /^-D(?:skipTests|skipITs|maven\.test\.(?:skip|failure\.ignore))(?:=(?!false$).*|$)/i;

function executableName(arg: string | undefined): string {
  return arg?.split(/[\\/]/).pop() ?? "";
}

export function classifyVerifyCommand(command: string): VerifyCommandKind {
  const invocation = command.trim().replace(/^cd\s+(?:"[^"]+"|'[^']+'|[^\s;&|]+)\s*&&\s+/, "");
  const words = invocation.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const args = words.map((word) => word.replace(/^["']|["']$/g, ""));
  const launcherIndex = /^(?:ba)?sh$/.test(executableName(args[0])) ? 1 : 0;
  const launcher = executableName(args[launcherIndex]);
  const tasks = args.slice(launcherIndex + 1);
  const simpleInvocation = !/[;&|<>`$#\r\n]/.test(invocation);

  if (GRADLE_LAUNCHER.test(launcher)) {
    return simpleInvocation && tasks.includes("check") && !tasks.some((arg) => GRADLE_LIMIT.test(arg))
      ? "full-verify" : "partial-test";
  }
  if (MAVEN_LAUNCHER.test(launcher)) {
    const hasVerifyPhase = tasks.includes("verify") || tasks.includes("install");
    const limitsVerification = tasks.some((arg) => MAVEN_LIMIT.test(arg) || MAVEN_TEST_FILTER.test(arg) || MAVEN_TEST_SKIP.test(arg));
    return simpleInvocation && hasVerifyPhase && !limitsVerification
      ? "full-verify" : "partial-test";
  }
  // 다른 셸 구문에 나타난 Gradle/Maven 문자열도 풀검증을 했다는 증거로 삼을 수 없다.
  return /gradlew|\bgradle\b|\bmvnw?\b|\bmaven\b/i.test(invocation) ? "partial-test" : "not-enforceable";
}

/** `gradlew check` / `mvn verify|install`만 풀검증으로 인정. 단순 test는 불인정. */
export function isFullVerifyCommand(command: string): boolean {
  return classifyVerifyCommand(command) === "full-verify";
}

/** gradle/maven이면 풀검증 강제 가능(true), npm/py/go 등이면 강제 불가(false → 미강제 라벨). */
export function isFullVerifyEnforceable(command: string): boolean {
  return classifyVerifyCommand(command) !== "not-enforceable";
}

export interface TestEvidenceInput {
  command: string;
  exitCode?: number;
  total?: number;
  passed?: number;
  failed?: number;
  unverified?: boolean;
  unverifiedReason?: string;
  testClasses?: string[];
}

export interface TestEvidenceRecord extends TestEvidenceInput {
  /** Server assigned implementation cycle; prevents old evidence in the same millisecond being treated as fresh. */
  implementationCycle?: number;
  inputFingerprint?: string;
  kind: TestEvidenceKind;
  recordedAt: string;
  derivedState: TestPassedState;
}

/**
 * exitCode/failed로부터 pass|fail|unverified를 판정한다 — 조작 방지 핵심: 이 값이 test_done의
 * "claim"과 대조되는 서버측 진실이다. exitCode가 아예 없으면 판정불가로 안전측 unverified.
 */
export function deriveTestState(input: TestEvidenceInput): TestPassedState {
  if (input.unverified) return "unverified";
  if (input.exitCode === undefined) return "unverified";
  if (input.exitCode === 0 && (input.failed ?? 0) === 0) return "pass";
  return "fail";
}

export function makeTestEvidenceRecord(kind: TestEvidenceKind, input: TestEvidenceInput, recordedAt: string): TestEvidenceRecord {
  return { ...input, kind, recordedAt, derivedState: deriveTestState(input) };
}

/**
 * test_done(claimedTestPassed)이 실제 기록된 증거와 일치하는지 대조한다(조작 방지).
 * evidence가 아예 없으면 "기록 없이 통과 주장"으로 거부, derivedState가 unverified면 환경부재
 * 선언으로 보고 claim과 무관하게 통과시킨다(교착 방지 — unverified는 auto-loop 무한재시도 방지용).
 */
export function checkTestEvidenceGate(claimedTestPassed: boolean, evidence: TestEvidenceRecord | null): GateCheckResult {
  if (!evidence) {
    return fail("TEST_EVIDENCE_MISSING", "test_done 전에 sugo_record_test_evidence로 실행 증거를 기록해야 합니다.");
  }
  if (evidence.derivedState === "unverified") return ok();
  const actuallyPassed = evidence.derivedState === "pass";
  if (claimedTestPassed !== actuallyPassed) {
    return fail(
      "TEST_EVIDENCE_MISMATCH",
      `testPassed 주장(${claimedTestPassed})이 기록된 증거(${evidence.derivedState}, exitCode=${evidence.exitCode}, failed=${evidence.failed ?? "?"})와 일치하지 않습니다.`,
    );
  }
  // 풀검증 명령 강제: gradle/maven 프로젝트에서 pass 주장하려면 gradlew check / mvn verify|install
  // 이어야 한다. 단순 test(gradlew test / mvn test)는 "test 그린은 증명 아님"으로 거부.
  // npm/pytest/go 등은 강제 불가(not-enforceable) → 통과시킨다(호출부가 미강제 라벨 노출).
  if (actuallyPassed && classifyVerifyCommand(evidence.command) === "partial-test") {
    return fail(
      "TEST_NOT_FULL_VERIFY",
      `기록된 명령("${evidence.command}")이 풀검증 명령이 아닙니다. 필터·스킵 옵션 없이 ./gradlew clean check, ./mvnw clean verify 또는 mvn clean verify를 실행하고 그 결과를 기록하세요.`,
    );
  }
  return ok();
}
