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
  | "TEST_NOT_FULL_VERIFY"
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
  | "SUBTASKS_INCOMPLETE"
  | "SPEC_ORACLE_NOT_RUN"
  | "ORACLE_OVERRIDE_REASON_REQUIRED"
  | "JIRA_OPTION_REQUIRED"
  | "JIRA_KEY_REQUIRED"
  | "CONFORMANCE_LEDGER_INCOMPLETE";

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

// ── §5.0 SPEC_ORACLE_NOT_RUN / 설계안·E.4 ────────────────────────────────

export interface SpecOracleState {
  /** clarify의 q-spec 답변 경로가 실재할 때만 true(§설계안 prd 부수효과). */
  required: boolean;
  ran: boolean;
  ranAt?: string;
  specPath?: string;
  uncovered?: { quote: string; reason: string }[];
  overrideReason?: string;
}

/**
 * `ready` 차단 게이트. PRD를 썼다는 것과 **원본 스펙 문서를 실제로 대조했다는 것은 다른 사실**이다.
 * 대조 없이 넘어가면 스펙에만 있고 PRD엔 없는 요구사항이 조용히 사라진 채 코딩이 시작된다.
 *
 * required가 아닐 때는 no-op — q-spec을 준 세션에서만 켜지는 조건부 게이트다(위험할 때만 조인다).
 * specOracle 자체가 없는 레거시 세션도 통과시킨다(하위호환, §5 "레거시 세션엔 기존 동작").
 */
export function checkSpecOracleGate(specOracle: SpecOracleState | undefined): GateCheckResult {
  if (!specOracle?.required) return ok();
  if (specOracle.ran) return ok();
  return fail(
    "SPEC_ORACLE_NOT_RUN",
    "q-spec 원본 스펙 대조(oracle)가 아직 기록되지 않았습니다 — sugo_plan({action:'oracle_done', ...})으로 대조 결과를 먼저 기록하세요.",
  );
}

/**
 * 설계안: 미커버 항목을 보고하면서 사유를 안 밝히는 것을 막는다. "스펙에 있는데 PRD엔
 * 없다"를 인지한 채로 그냥 넘어가는 게 가장 위험한 경로라, 넘어가려면 **왜 넘어가는지**를
 * 남기게 한다(차단이 아니라 기록 강제 — 정직한 탈출구는 열어둔다).
 */
export function checkOracleDone(
  uncovered: { quote: string; reason: string }[] | undefined,
  overrideReason: string | undefined,
): GateCheckResult {
  if (!uncovered || uncovered.length === 0) return ok();
  if (overrideReason && overrideReason.trim().length > 0) return ok();
  return fail(
    "ORACLE_OVERRIDE_REASON_REQUIRED",
    `미커버 항목 ${uncovered.length}건을 보고했습니다 — 그대로 진행하려면 overrideReason(왜 지금 커버하지 않는지)이 필요합니다.`,
  );
}

export type JiraOption = "new" | "link" | "skip";

/** 설계안: `jiraOption` 필수, `link`면 `jiraKey` 필수. */
export function checkJiraOption(option: string | undefined, jiraKey: string | undefined): GateCheckResult {
  if (!option) return fail("JIRA_OPTION_REQUIRED", "jira action에는 jiraOption('new'|'link'|'skip')이 필요합니다.");
  if (option === "link" && !(jiraKey && jiraKey.trim().length > 0)) {
    return fail("JIRA_KEY_REQUIRED", "jiraOption:'link'에는 연결할 jiraKey가 필요합니다.");
  }
  return ok();
}

// ── §5.0 CONFORMANCE_LEDGER_INCOMPLETE (prd 차단) ────────────────────────────

/**
 * In-Scope / DoD 섹션의 항목들이 전부 실재하는 REQ에 매핑되는지 확인한다.
 *
 * **왜 막나:** PRD에 "하기로 한 일"을 적어놓고 그 중 일부를 REQ로 승격하지 않으면, 그 항목은
 * 아무 게이트도 안 거친 채 문장으로만 남는다 — 로드맵 subtask로 안 심기니 진행률에도 안 잡히고
 * review_done의 PRD 커버리지 대조에도 안 걸려서 **조용히 증발한다.** 원장과 REQ가 맞물릴 때만
 * 통과시키는 게 이 게이트의 전부다.
 *
 * **Out-of-Scope는 대상이 아니다** — 안 하기로 한 일에 REQ를 요구하면 그게 더 이상하다.
 * 섹션이 아예 없으면 no-op(레거시 PRD 하위호환, §5 "레거시 세션엔 기존 동작").
 */
const LEDGER_HEADING = /^#{1,6}\s*.*(in[-\s]?scope|범위|dod|완료\s*조건|definition of done)/i;
const OUT_OF_SCOPE_HEADING = /out[-\s]?of[-\s]?scope|범위\s*외|제외/i;
const REQ_REF = /\bREQ-\d+\b/gi;

export function validateConformanceLedger(prdContent: string): GateCheckResult {
  const lines = prdContent.split(/\r?\n/);

  // **선언은 원장 밖에서만 인정한다.** 원장 항목 안의 태그까지 선언으로 치면 오타 참조가
  // 스스로를 선언해버려(`REQ-009` 하나만 적어도 통과) 유령 참조를 영영 못 잡는다.
  const declaredReqs = new Set<string>();
  {
    let scanLedger = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (/^#{1,6}\s/.test(line)) {
        scanLedger = LEDGER_HEADING.test(line) && !OUT_OF_SCOPE_HEADING.test(line);
        if (!scanLedger) for (const m of line.match(REQ_REF) ?? []) declaredReqs.add(m.toUpperCase());
        continue;
      }
      if (scanLedger) continue;
      for (const m of line.match(REQ_REF) ?? []) declaredReqs.add(m.toUpperCase());
    }
  }

  const uncovered: string[] = [];
  const ghost: string[] = [];
  let inLedger = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) {
      inLedger = LEDGER_HEADING.test(line) && !OUT_OF_SCOPE_HEADING.test(line);
      continue;
    }
    if (!inLedger) continue;

    const item = line.replace(/^[-*+]\s*/, "").replace(/^\d+\.\s*/, "").trim();
    if (item === line && !/^[-*+]\s|^\d+\.\s/.test(line)) continue; // 불릿이 아닌 산문은 항목이 아니다
    if (item.length === 0) continue; // 빈 불릿

    const refs = item.match(REQ_REF);
    if (!refs || refs.length === 0) {
      uncovered.push(item);
      continue;
    }
    for (const ref of refs) {
      if (!declaredReqs.has(ref.toUpperCase())) ghost.push(ref.toUpperCase());
    }
  }

  if (uncovered.length === 0 && ghost.length === 0) return ok();

  const parts: string[] = [];
  if (uncovered.length > 0) parts.push(`REQ 미매핑 ${uncovered.length}건: ${uncovered.join(" / ")}`);
  if (ghost.length > 0) parts.push(`존재하지 않는 REQ 참조: ${[...new Set(ghost)].join(", ")}`);
  return fail(
    "CONFORMANCE_LEDGER_INCOMPLETE",
    `In-Scope/DoD 원장이 REQ와 맞물리지 않습니다 — ${parts.join(" · ")}. 항목을 REQ로 승격하거나 원장에서 빼세요.`,
  );
}
