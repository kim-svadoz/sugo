import type { TestPassedState } from "./testEvidence.js";

export type GateBlockCode =
  | "PRD_TOO_SHORT"
  | "PRD_MISSING_REQUIREMENTS"
  | "ANALYZE_NOT_CALLED"
  | "BASELINE_NOT_GREEN"
  | "WIRING_TEST_MISSING"
  | "REGISTRATION_GLUE_NOT_CHECKED"
  | "BOOT_GATE_FAILED"
  | "TEST_EVIDENCE_MISSING"
  | "TEST_EVIDENCE_MISMATCH"
  | "USER_CONFIRMATION_REQUIRED"
  | "SUMMARY_TOO_FEW_LINES"
  | "SUMMARY_TOO_SHORT"
  | "SUMMARY_LOW_CHAR_DIVERSITY"
  | "SUMMARY_LOW_TOKEN_DIVERSITY"
  | "RUNTIME_UNVERIFIED_GATE_FAILED"
  | "RUNTIME_CLAIM_CONTRADICTS_EVIDENCE"
  | "RUNTIME_WIRING_NOT_VERIFIED"
  | "COVERAGE_MAP_REQUIRED"
  | "PRD_COVERAGE_INCOMPLETE"
  | "REGRESSION_NOT_INTACT"
  | "INTEGRATION_TEST_MISSING"
  | "EVIDENCE_REUSE_NO_BASELINE"
  | "EVIDENCE_REUSE_NOT_GREEN"
  | "EVIDENCE_REUSE_FINGERPRINT_MISMATCH"
  | "CONTRACT_EVIDENCE_MISSING"
  | "CONTRACT_EVIDENCE_INCOMPLETE"
  | "CONTRACT_NOT_STARTED"
  | "LABEL_CONTRADICTION"
  | "MANIFEST_HAS_CYCLE"
  | "MANIFEST_FILE_OVERLAP"
  | "MANIFEST_REQUIREMENT_UNCOVERED"
  | "SUBTASK_NOT_FOUND"
  | "SUBTASKS_INCOMPLETE";

export interface GateCheckResult {
  ok: boolean;
  code?: GateBlockCode;
  message?: string;
}

export function ok(): GateCheckResult {
  return { ok: true };
}
export function fail(code: GateBlockCode, message: string): GateCheckResult {
  return { ok: false, code, message };
}

// ── PRD 최소 요건 (설계안: 본문 ≥100자, 요구사항(REQ) ≥1) ─────────────────────

export interface PrdValidation {
  ok: boolean;
  length: number;
  reqCount: number;
  errors: GateBlockCode[];
}

const REQ_TAG_RE = /\bREQ-\d+\b/g;

export function validatePrd(content: string): PrdValidation {
  const trimmed = content.trim();
  const length = trimmed.length;
  const reqIds = new Set((trimmed.match(REQ_TAG_RE) ?? []).map((s) => s.toUpperCase()));
  const reqCount = reqIds.size;
  const errors: GateBlockCode[] = [];
  if (length < 100) errors.push("PRD_TOO_SHORT");
  if (reqCount < 1) errors.push("PRD_MISSING_REQUIREMENTS");
  return { ok: errors.length === 0, length, reqCount, errors };
}

// ── baseline 건강성 게이트 (§4.0) ────────────────────────────────────────────

export interface BaselineSignalResult {
  required: boolean;
  signals: string[];
}

// 주어-서술어 사이에 조사/수식어("버전을", "-starter")가 끼는 실제 한국어 문장을 잡기 위해
// \s* 대신 짧은 gap([\s\S]{0,N})을 허용한다 — 너무 넓으면 오탐, 너무 좁으면 자연어를 놓친다.
const BASELINE_SIGNAL_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "jdk-runtime-upgrade", re: /(JDK|자바\s*버전|java\s*version|런타임)[\s\S]{0,12}(상향|업그레이드|변경|마이그레이션|upgrade|migration)/i },
  { label: "build-system-change", re: /(빌드\s*시스템|build\s*system)[\s\S]{0,12}(변경|교체|전환|migration)/i },
  { label: "dependency-removal", re: /의존성[\s\S]{0,6}(제거|삭제|내재화)|(dependency|library)[\s\S]{0,12}(removal|removed|inlin(e|ing))/i },
];

/** PRD 본문을 정규식으로 스캔해 위험 변경 시그널을 판정한다. 시그널 없으면 no-op(required:false). */
export function detectBaselineSignals(prdContent: string): BaselineSignalResult {
  const signals = BASELINE_SIGNAL_PATTERNS.filter((p) => p.re.test(prdContent)).map((p) => p.label);
  return { required: signals.length > 0, signals };
}

export function checkBaselineGate(required: boolean, baselineEvidenceExitCode: number | null): GateCheckResult {
  if (!required) return ok();
  if (baselineEvidenceExitCode === null) {
    return fail("BASELINE_NOT_GREEN", "baseline 시그널이 감지된 PRD입니다. code_done 전에 baseline 테스트 증거(record_test_evidence, kind=baseline)가 필요합니다.");
  }
  if (baselineEvidenceExitCode !== 0) {
    return fail("BASELINE_NOT_GREEN", `baseline 테스트가 그린이 아닙니다(exitCode=${baselineEvidenceExitCode}).`);
  }
  return ok();
}

// ── analyze 호출강제 (§4.1-1) ────────────────────────────────────────────────

/** analyzePassed:true 같은 자기보고 파라미터가 아니라 서버가 기록한 호출 횟수만 본다. */
export function checkAnalyzeGate(analyzeAttempts: number, hasPrd: boolean): GateCheckResult {
  if (!hasPrd) return ok();
  if (analyzeAttempts < 1) {
    return fail("ANALYZE_NOT_CALLED", "code_done 전에 sugo_analyze를 최소 1회 실제 호출해야 합니다.");
  }
  return ok();
}

// ── wiring-gate (§4.1-3) ─────────────────────────────────────────────────────

const WIRING_FILE_PATTERNS: RegExp[] = [
  /(^|[\\/])application(-[^\\/.]*)?\.(ya?ml|properties)$/i,
  /(^|[\\/])\w+Config(uration)?\.(java|kt)$/,
  /(^|[\\/])docker-compose(\.[^\\/]*)?\.ya?ml$/i,
  /(^|[\\/])Dockerfile$/i,
  /(^|[\\/])\.env(\.[^\\/]*)?$/,
  /(^|[\\/])(build\.gradle(\.kts)?|pom\.xml)$/,
];

export function isWiringChange(changedFiles: string[]): boolean {
  return changedFiles.some((f) => WIRING_FILE_PATTERNS.some((re) => re.test(f)));
}

export function checkWiringGate(changedFiles: string[], mode: "plan" | "patch", wiringTestAdded: boolean): GateCheckResult {
  const triggered = mode === "patch" || isWiringChange(changedFiles);
  if (!triggered) return ok();
  if (!wiringTestAdded) {
    return fail(
      "WIRING_TEST_MISSING",
      "배선/설정 파일 변경(또는 patch 모드)이 감지되었습니다. mock 없는 배선 테스트를 추가/검증했는지(wiringTestAdded)가 필요합니다.",
    );
  }
  return ok();
}

// ── registration-glue 게이트 (§4.1-4) ────────────────────────────────────────

export function checkRegistrationGlueGate(dependencyRemoved: boolean, registrationGlueChecked: boolean): GateCheckResult {
  if (!dependencyRemoved) return ok();
  if (!registrationGlueChecked) {
    return fail(
      "REGISTRATION_GLUE_NOT_CHECKED",
      "의존성 제거/내재화가 선언되었습니다. 등록 글루(빈 등록 메타)가 동일하게 유지되는지 diff로 확인(registrationGlueChecked)해야 합니다.",
    );
  }
  return ok();
}

// ── boot-gate (§4.1-5) ───────────────────────────────────────────────────────

/**
 * 인정 기준: 줄 첫 비공백이 @SpringBootTest인 어노테이션 위치만. 주석/문자열 리터럴/슬라이스
 * 테스트(@WebMvcTest)는 이 정규식에 걸리지 않는다(거짓 그린 방지) — 설계안 boot-gate 코퍼스 참고.
 */
const SPRING_BOOT_TEST_ANNOTATION_RE = /^[ \t]*@SpringBootTest\b/m;

export function hasValidSpringBootTestAnnotation(fileContents: string[]): boolean {
  return fileContents.some((content) => SPRING_BOOT_TEST_ANNOTATION_RE.test(content));
}

export function checkBootGate(bootable: boolean, annotationFound: boolean, bootUnverifiedReason?: string): GateCheckResult {
  if (!bootable) return ok();
  if (annotationFound) return ok();
  if (bootUnverifiedReason && bootUnverifiedReason.trim().length > 0) return ok();
  return fail(
    "BOOT_GATE_FAILED",
    "부팅 가능 스택(Spring Boot)인데 풀컨텍스트 @SpringBootTest가 발견되지 않았습니다. 환경부재면 bootUnverifiedReason으로 라벨링하세요.",
  );
}

// ── review_done 3중 게이트 (§4.3) ────────────────────────────────────────────

export function checkUserConfirmationGate(userConfirmed: boolean): GateCheckResult {
  if (!userConfirmed) {
    return fail(
      "USER_CONFIRMATION_REQUIRED",
      "review_done 전에 work-result를 사람에게 보여주고 확인(userConfirmed:true)받아야 합니다.",
    );
  }
  return ok();
}

export interface SummaryQuality {
  ok: boolean;
  lines: number;
  length: number;
  uniqueChars: number;
  distinctTokens: number;
  errors: GateBlockCode[];
}

/** 설계안: 줄 ≥3, 길이 ≥30자, 공백제외 고유문자 ≥10, 2자이상 구별토큰 ≥5(반복문자 패딩 차단). */
export function validateSummaryQuality(summary: string): SummaryQuality {
  const trimmed = summary.trim();
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;
  const length = trimmed.length;
  const uniqueChars = new Set(trimmed.replace(/\s+/g, "")).size;
  const tokens = trimmed.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
  const distinctTokens = new Set(tokens.map((t) => t.toLowerCase())).size;

  const errors: GateBlockCode[] = [];
  if (lines < 3) errors.push("SUMMARY_TOO_FEW_LINES");
  if (length < 30) errors.push("SUMMARY_TOO_SHORT");
  if (uniqueChars < 10) errors.push("SUMMARY_LOW_CHAR_DIVERSITY");
  if (distinctTokens < 5) errors.push("SUMMARY_LOW_TOKEN_DIVERSITY");

  return { ok: errors.length === 0, lines, length, uniqueChars, distinctTokens, errors };
}

export interface RuntimeCheck {
  buildAttempted: boolean;
  testRun: boolean;
  runtimeVerified: boolean;
  wiringVerified?: boolean;
  failures?: string[];
  unverifiedReason?: string;
}

/**
 * 런타임 검증 게이트. 핵심은 "자기보고보다 서버 기록이 우선"이다 — runtimeVerified:true를
 * 주장해도 test_done에서 기록된 testPassedState가 fail이면 무시하고 거부한다(§4.3 "loud label").
 * 부팅 가능 스택은 wiringVerified까지 명시적으로 요구한다("앱이 실제 뜨나").
 */
export function checkRuntimeVerificationGate(
  testPassedState: TestPassedState | null,
  runtimeCheck: RuntimeCheck,
  bootable: boolean,
): GateCheckResult {
  const labeled = !!(runtimeCheck.unverifiedReason && runtimeCheck.unverifiedReason.trim().length > 0);

  if (!runtimeCheck.runtimeVerified) {
    if (labeled) return ok();
    return fail(
      "RUNTIME_UNVERIFIED_GATE_FAILED",
      "실제 빌드+테스트로 그린임을 증명(runtimeVerified:true)하거나 환경부재를 unverifiedReason으로 라벨링해야 합니다.",
    );
  }

  if (testPassedState === "fail") {
    return fail(
      "RUNTIME_CLAIM_CONTRADICTS_EVIDENCE",
      "기록된 test evidence가 fail인데 runtimeVerified:true를 주장했습니다 — 자기보고보다 기록된 증거가 우선합니다.",
    );
  }

  if (bootable && runtimeCheck.wiringVerified !== true) {
    if (labeled) return ok();
    return fail(
      "RUNTIME_WIRING_NOT_VERIFIED",
      "부팅 가능 스택은 wiringVerified:true(앱이 실제 뜨는지 배선 검증)가 필요합니다.",
    );
  }

  return ok();
}
