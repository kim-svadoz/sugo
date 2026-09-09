import { readFile } from "node:fs/promises";
import { z } from "zod";
import { extractRequirements } from "../analyze.js";
import { isProjectBootable } from "../bootable.js";
import { scanForSpringBootTestAnnotation } from "../bootScan.js";
import { writePatchPrdFile, writePatchWorkResultFile, writePrdFile, writeWorkResultFile } from "../feature.js";
import { checkCoverageGate } from "../consistency.js";
import { checkContractEvidenceGate, checkContractStartedGate, resolveContractRequired } from "../contractEvidence.js";
import { emitActivity } from "../dashboard/activity.js";
import { fetchCalibratedRatio } from "../dashboard/fetch.js";
import { collectPrRefs } from "../prRefs.js";
import { validateIntegration, validateManifest, type DecomposeManifest } from "../decompose.js";
import { checkEvidenceReuseGate, computeChangedFilesFingerprint } from "../fingerprint.js";
import {
  checkAnalyzeGate,
  checkBaselineGate,
  checkBootGate,
  checkRegistrationGlueGate,
  checkRuntimeVerificationGate,
  checkUserConfirmationGate,
  checkWiringGate,
  detectBaselineSignals,
  validatePrd,
  validateSummaryQuality,
  checkJiraOption,
  checkOracleDone,
  checkSpecOracleGate,
  validateConformanceLedger,
  type GateBlockCode,
  type RuntimeCheck,
} from "../gates.js";
import { loadProjectConfig } from "../harness/config.js";
import { renderToolMenu, resolveHarnessToolGuides } from "../harness/toolRegistry.js";
import { findRegistryEntry } from "../harness/registry.js";
import { estimateHumanHours } from "../humanHours.js";
import { checkpointApplies } from "../hulk/matching.js";
import { addWorkLog } from "../hulk/history.js";
import { listCheckpoints } from "../hulk/checkpoint.js";
import { backfillRoadmapTask, completeTaskRequirements, updateRoadmapNodeStatus, upsertRoadmapNodes } from "../hulk/roadmap.js";
import { promotePrdRequirements } from "../hulk/roadmapReq.js";
import { addTask, findTaskByPrdRef, updateTask } from "../hulk/task.js";
import type { Task, TaskPatchInfo } from "../hulk/types.js";
import {
  computeCompletionGrade,
  detectLabelContradiction,
  hasGreenExecutionEvidence,
  renderBypassSummary,
  type BypassLabel,
} from "../labelGuard.js";
import { PatchEntryError, resolvePatchContext, type PatchContext } from "../patch.js";
import { applyTransition } from "../planStateMachine.js";
import { generateSessionId, loadSession, saveSession, sessionExists } from "../session.js";
import { checkTestEvidenceGate, isFullVerifyEnforceable } from "../testEvidence.js";
import { planArgsActionEnum, type PlanAction, type PlanSession } from "../types.js";

export const sugoPlanInputSchema = {
  action: z.enum(planArgsActionEnum).describe("파이프라인 상태머신 액션"),
  sessionId: z.string().optional().describe("start 이외의 모든 action에 필요. start 결과로 발급됨"),
  projectPath: z.string().optional().describe("start action에 필요"),
  featureName: z.string().optional().describe("start action에 선택적으로 사용"),
  workResultPath: z
    .string()
    .optional()
    .describe("start action: patch 진입점(§7) — 기존 work-result.md(또는 work-result-patch-vN.md) 경로. 미입력시 기존(신규 PRD) 동작"),
  seed: z
    .string()
    .optional()
    .describe("start action(§7.1 Patch 성숙화): 이번 patch 차수에 대한 사용자 지시. review_done이 work-result에 함께 기록한다"),
  prdContent: z.string().optional().describe("prd action에 필요. 본문 ≥100자, REQ-N 태그 ≥1"),
  specPath: z
    .string()
    .optional()
    .describe("prd action(§5.0): 대조할 원본 스펙 문서(q-spec) 경로. 실재하면 specOracle이 켜져 ready 전에 oracle_done이 필수가 된다"),
  uncovered: z
    .array(z.object({ quote: z.string(), reason: z.string() }))
    .optional()
    .describe("oracle_done: 원본 스펙에 있으나 PRD가 못 덮은 항목들(인용 + 사유). 1건 이상이면 overrideReason 필수"),
  overrideReason: z
    .string()
    .optional()
    .describe("oracle_done: 미커버 항목을 남긴 채 진행하는 사유"),
  jiraOption: z.enum(["new", "link", "skip"]).optional().describe("jira action에 필요. 'link'면 jiraKey도 필요"),
  jiraKey: z.string().optional().describe("jira action에서 jiraOption:'link'일 때의 기존 티켓 키"),
  changedFiles: z.array(z.string()).optional().describe("code_done action에서 이번 코딩으로 바뀐 파일 목록"),
  dependencyRemoved: z.boolean().optional().describe("code_done: 의존성을 제거/내재화했는지(registration-glue 게이트 트리거)"),
  registrationGlueChecked: z.boolean().optional().describe("code_done: 등록 글루(빈 등록 메타) diff를 점검했는지"),
  wiringTestAdded: z.boolean().optional().describe("code_done: 배선/설정 변경에 대해 mock 없는 배선 테스트를 추가/검증했는지"),
  bootUnverifiedReason: z.string().optional().describe("code_done: boot-gate를 환경부재로 우회할 때의 사유 라벨"),
  contractEnvironmentAbsentReason: z
    .string()
    .optional()
    .describe("contract_done: 계약테스트를 실행할 환경이 없을 때 red 확인 요구를 우회하는 사유 라벨(§4.6 라벨-모순 검사 대상)"),
  testPassed: z.boolean().optional().describe("test_done action에 필요. 서버에 기록된 test evidence와 대조된다"),
  userConfirmed: z.boolean().optional().describe("review_done action에 필요. work-result를 사람에게 보여주고 확인받았는지"),
  summary: z.string().optional().describe("review_done action에 필요. work-result 요약(§4.3: 줄≥3, 길이≥30자 등)"),
  runtimeCheck: z
    .object({
      buildAttempted: z.boolean(),
      testRun: z.boolean(),
      runtimeVerified: z.boolean(),
      wiringVerified: z.boolean().optional(),
      failures: z.array(z.string()).optional(),
      unverifiedReason: z.string().optional().describe("환경부재로 우회할 때의 사유 라벨"),
    })
    .optional()
    .describe("review_done action에 필요. 실제 빌드+테스트 결과"),
  reusedFromTestDone: z
    .boolean()
    .optional()
    .describe("review_done action: §10 이중 실행 제거 — test_done 증거를 재사용할지. 변경파일 지문이 일치하면 runtimeCheck 없이 통과한다"),
  userReportedHumanHours: z
    .number()
    .optional()
    .describe("commit action: 사람이 보고한 실제 소요시간(시간 단위) — HULK 생산성 지표 자가보정 루프(§8)"),
  coverageMap: z
    .object({
      acceptanceCriteria: z.array(z.object({ id: z.string(), covered: z.boolean() })),
      responseFields: z.array(z.object({ field: z.string(), asserted: z.boolean() })),
      integrationTestCount: z.number(),
      regressionChecked: z.boolean(),
      regressionIntact: z.boolean(),
    })
    .optional()
    .describe("test_done action: §10 PRD 정합성 게이트(선택 확장) — verificationPolicy.integrationGateEnforced가 켜져 있으면 필수"),
  manifest: z
    .object({
      subtasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          dependsOn: z.array(z.string()).default([]),
          files: z.array(z.string()).default([]),
          coversRequirements: z.array(z.string()).default([]),
        }),
      ),
    })
    .optional()
    .describe("decompose action에 필요. §10 오케스트레이션 매니페스트 — 사이클/파일겹침/요구커버리지를 검증한다"),
  subtaskId: z.string().optional().describe("subtask_start/subtask_done action에 필요"),
  subtaskChangedFiles: z.array(z.string()).optional().describe("subtask_done action: 이 서브태스크가 실제로 바꾼 파일"),
};

const SugoPlanArgs = z.object(sugoPlanInputSchema);

export async function handleSugoPlan(rawArgs: unknown) {
  const args = SugoPlanArgs.parse(rawArgs);
  const { action, sessionId } = args;

  let existing: PlanSession | null = null;
  if (action !== "start") {
    if (!sessionId) {
      return errorResult("SESSION_ID_REQUIRED", `action "${action}"에는 sessionId가 필요합니다.`);
    }
    if (!(await sessionExists(sessionId))) {
      return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${sessionId}`);
    }
    existing = await loadSession(sessionId);
  }

  // ── §4.6 label-guard: 이번 호출에서 실제로 "우회 라벨"이 쓰였다면 여기 누적했다가, 상태전이가
  // 성공한 뒤 세션에 반영한다(차단이 아니라 강등용 감사 기록 — commit 시점에 completionGrade를 낮춘다).
  const newBypassLabels: BypassLabel[] = [];
  const currentPatchVersion = existing?.data.patch?.version ?? 0;
  function greenEvidenceSnapshot(session: PlanSession) {
    return {
      baselineExitCode: session.data.baselineGate?.evidence?.exitCode ?? null,
      testDerivedState: session.data.chainInfo.testPassedState,
      contractTests: session.data.chainInfo.contractTests,
    };
  }

  // ── 콘텐츠 게이트(§4): 순서강제(prerequisite)와 별개로 액션별 페이로드를 검증한다.
  // 상태 전이 전에 막아야 "READY로 되돌아갔다가 재시도" 같은 오염된 중간상태가 안 남는다.
  if (action === "prd") {
    if (!args.prdContent) return errorResult("PRD_CONTENT_REQUIRED", "prd action에는 prdContent가 필요합니다.");
    const ledger = validateConformanceLedger(args.prdContent);
    if (!ledger.ok) return errorResult(ledger.code as GateBlockCode, ledger.message!);
    const validation = validatePrd(args.prdContent);
    if (!validation.ok) {
      return errorResult(
        validation.errors[0],
        `PRD 검증 실패: 길이=${validation.length}자(≥100 필요), REQ 태그=${validation.reqCount}개(≥1 필요)`,
      );
    }
  }

  // ── §5.0 oracle_done: 미커버 항목을 보고하면서 사유를 안 밝히는 것만 막는다(§설계안).
  if (action === "oracle_done") {
    const oracleResult = checkOracleDone(args.uncovered, args.overrideReason);
    if (!oracleResult.ok) return errorResult(oracleResult.code as GateBlockCode, oracleResult.message!);
  }

  // ── 설계안 jira: 옵션 필수, link면 키 필수.
  if (action === "jira") {
    const jiraResult = checkJiraOption(args.jiraOption, args.jiraKey);
    if (!jiraResult.ok) return errorResult(jiraResult.code as GateBlockCode, jiraResult.message!);
  }

  // ── §5.0 ready: q-spec 대조(oracle)를 안 했으면 차단. PRD를 썼다는 것과 원본 스펙을 실제로
  // 대조했다는 것은 다른 사실이고, 대조 없이 넘어가면 스펙에만 있는 요구사항이 조용히 사라진다.
  if (action === "ready" && existing) {
    const oracleGate = checkSpecOracleGate(existing.data.specOracle);
    if (!oracleGate.ok) return errorResult(oracleGate.code as GateBlockCode, oracleGate.message!);
  }

  // ── §3/§4.0 baseline_capture. code_done에도 동일 게이트를 남겨둔다(이중 방어).
  //
  // ⚠️ decompose 경로는 이 보호를 **못 받는다.** PRD→DECOMPOSE→ORCHESTRATING→(integrate)→
  // DOCS_PENDING이라 baseline_capture도 code_done도 안 거친다. §4 흐름도가 DOCS_PENDING 합류를
  // 명시하는 근거는 "서브태스크 각자가 자기 검증을 끝냈다"는 전제인데, 서브태스크별 게이트가
  // 아직 없다 — **이 경로는 현재 게이트 공백**이다.
  if (action === "baseline_capture" && existing) {
    const baselineRequired = existing.data.baselineGate?.required ?? false;
    const baselineExitCode = existing.data.baselineGate?.evidence?.exitCode ?? null;
    const baselineResult = checkBaselineGate(baselineRequired, baselineExitCode);
    if (!baselineResult.ok) return errorResult(baselineResult.code as GateBlockCode, baselineResult.message!);
  }

  // ── §3 contract_done: 구현 전 red 확인을 요구한다(review_done의 checkContractEvidenceGate는
  // 나중에 red→green 전이 전체를 재검증 — 서로 다른 단계를 본다). resolveContractRequired는
  // §9/§4.3 "undefined면 기본-on 휴리스틱"을 적용한다(contractEvidence.ts 주석 참고).
  if (action === "contract_done" && existing) {
    const projectConfigForContractStart = await loadProjectConfig(existing.projectPath);
    const contractRequired = resolveContractRequired(projectConfigForContractStart?.verificationPolicy?.contractEvidenceRequired, {
      baselineRequired: existing.data.baselineGate?.required ?? false,
    });
    const claimsAbsent = !!args.contractEnvironmentAbsentReason && args.contractEnvironmentAbsentReason.trim().length > 0;
    if (claimsAbsent) {
      const contradiction = detectLabelContradiction(true, hasGreenExecutionEvidence(greenEvidenceSnapshot(existing)));
      if (!contradiction.ok) return errorResult(contradiction.code as GateBlockCode, contradiction.message!);
    }
    const contractStartedResult = checkContractStartedGate(
      existing.data.chainInfo.contractTests ?? [],
      contractRequired,
      args.contractEnvironmentAbsentReason,
    );
    if (!contractStartedResult.ok) return errorResult(contractStartedResult.code as GateBlockCode, contractStartedResult.message!);
    if (claimsAbsent && contractRequired) {
      newBypassLabels.push({
        kind: "contractEvidenceMissing",
        reason: args.contractEnvironmentAbsentReason!,
        patchVersion: currentPatchVersion,
        recordedAt: new Date().toISOString(),
      });
    }
  }

  if (action === "code_done" && existing) {
    const changedFiles = args.changedFiles ?? [];
    const hasPrd = !!existing.data.prdPath;

    const analyzeGate = checkAnalyzeGate(existing.data.chainInfo.analyzeAttempts, hasPrd);
    if (!analyzeGate.ok) return errorResult(analyzeGate.code as GateBlockCode, analyzeGate.message!);

    const baselineRequired = existing.data.baselineGate?.required ?? false;
    const baselineExitCode = existing.data.baselineGate?.evidence?.exitCode ?? null;
    const baselineResult = checkBaselineGate(baselineRequired, baselineExitCode);
    if (!baselineResult.ok) return errorResult(baselineResult.code as GateBlockCode, baselineResult.message!);

    const wiringResult = checkWiringGate(changedFiles, existing.data.mode, args.wiringTestAdded ?? false);
    if (!wiringResult.ok) return errorResult(wiringResult.code as GateBlockCode, wiringResult.message!);

    const glueResult = checkRegistrationGlueGate(args.dependencyRemoved ?? false, args.registrationGlueChecked ?? false);
    if (!glueResult.ok) return errorResult(glueResult.code as GateBlockCode, glueResult.message!);

    const bootable = await isProjectBootable(existing.projectPath);
    const bootAnnotationFound = bootable ? await scanForSpringBootTestAnnotation(existing.projectPath) : false;
    const claimsBootAbsent = bootable && !bootAnnotationFound && !!args.bootUnverifiedReason && args.bootUnverifiedReason.trim().length > 0;
    if (claimsBootAbsent) {
      const contradiction = detectLabelContradiction(true, hasGreenExecutionEvidence(greenEvidenceSnapshot(existing)));
      if (!contradiction.ok) return errorResult(contradiction.code as GateBlockCode, contradiction.message!);
    }
    const bootResult = checkBootGate(bootable, bootAnnotationFound, args.bootUnverifiedReason);
    if (!bootResult.ok) return errorResult(bootResult.code as GateBlockCode, bootResult.message!);
    if (claimsBootAbsent) {
      newBypassLabels.push({
        kind: "bootUnverified",
        reason: args.bootUnverifiedReason!,
        patchVersion: currentPatchVersion,
        recordedAt: new Date().toISOString(),
      });
    }
  }

  if (action === "test_done" && existing) {
    if (args.testPassed === undefined) {
      return errorResult("TEST_PASSED_REQUIRED", "test_done action에는 testPassed가 필요합니다.");
    }
    const evidenceResult = checkTestEvidenceGate(args.testPassed, existing.data.chainInfo.testEvidence ?? null);
    if (!evidenceResult.ok) return errorResult(evidenceResult.code as GateBlockCode, evidenceResult.message!);

    // ── §4.6 label-guard: testEvidence가 unverified(환경부재 선언)로 기록됐다면, 같은 세션에
    // 이미 그린 증거(baseline 등 — 이 evidence 자신은 순환을 피하려 제외)가 있는지 대조한다.
    const feature = existing.data.chainInfo.testEvidence;
    if (feature?.derivedState === "unverified") {
      const contradiction = detectLabelContradiction(
        true,
        hasGreenExecutionEvidence({
          baselineExitCode: existing.data.baselineGate?.evidence?.exitCode ?? null,
          contractTests: existing.data.chainInfo.contractTests,
        }),
      );
      if (!contradiction.ok) return errorResult(contradiction.code as GateBlockCode, contradiction.message!);
      newBypassLabels.push({
        kind: "environmentAbsent",
        reason: feature.unverifiedReason ?? "사유 미기재",
        patchVersion: currentPatchVersion,
        recordedAt: new Date().toISOString(),
      });
    }

    // ── §10 PRD 정합성 게이트(선택 확장, opt-in): config.verificationPolicy.integrationGateEnforced가
    // 켜져 있으면 coverageMap 제출을 강제한다. 꺼져 있으면 제출된 경우에만 검증(하위호환).
    const projectConfig = await loadProjectConfig(existing.projectPath);
    const enforced = projectConfig?.verificationPolicy?.integrationGateEnforced ?? false;
    if (enforced && !args.coverageMap) {
      return errorResult(
        "COVERAGE_MAP_REQUIRED",
        "이 프로젝트는 verificationPolicy.integrationGateEnforced가 켜져 있어 test_done에 coverageMap이 필요합니다.",
      );
    }
    if (args.coverageMap) {
      const coverageResult = checkCoverageGate(args.coverageMap);
      if (!coverageResult.ok) return errorResult(coverageResult.code as GateBlockCode, coverageResult.message!);
    }
  }

  if (action === "review_done" && existing) {
    const confirmResult = checkUserConfirmationGate(args.userConfirmed ?? false);
    if (!confirmResult.ok) return errorResult(confirmResult.code as GateBlockCode, confirmResult.message!);

    if (!args.summary) return errorResult("SUMMARY_REQUIRED", "review_done action에는 summary가 필요합니다.");
    const summaryQuality = validateSummaryQuality(args.summary);
    if (!summaryQuality.ok) {
      return errorResult(
        summaryQuality.errors[0],
        `summary 품질 미달: 줄=${summaryQuality.lines}(≥3), 길이=${summaryQuality.length}자(≥30), ` +
          `고유문자=${summaryQuality.uniqueChars}개(≥10), 구별토큰=${summaryQuality.distinctTokens}개(≥5)`,
      );
    }

    // ── §10 이중 실행 제거: reusedFromTestDone이면 지문이 일치할 때 runtimeCheck 없이 통과시킨다.
    let runtimeSatisfiedByReuse = false;
    if (args.reusedFromTestDone) {
      const currentFingerprint = await computeChangedFilesFingerprint(existing.projectPath, existing.data.chainInfo.changedFiles);
      const reuseResult = checkEvidenceReuseGate(
        true,
        existing.data.chainInfo.testEvidenceFingerprint,
        currentFingerprint,
        existing.data.chainInfo.testPassedState,
      );
      if (!reuseResult.ok) return errorResult(reuseResult.code as GateBlockCode, reuseResult.message!);
      runtimeSatisfiedByReuse = true;
    }

    if (!runtimeSatisfiedByReuse) {
      if (!args.runtimeCheck) return errorResult("RUNTIME_CHECK_REQUIRED", "review_done action에는 runtimeCheck가 필요합니다.");
      const bootable = await isProjectBootable(existing.projectPath);
      const rc = args.runtimeCheck as RuntimeCheck;
      const labeled = !!rc.unverifiedReason && rc.unverifiedReason.trim().length > 0;
      // ── §4.6 label-guard: 어떤 종류의 우회가 실제로 쓰이려는지 먼저 판별해 모순부터 검사한다.
      const claimsRuntimeAbsent = labeled && !rc.runtimeVerified;
      const claimsWiringAbsent = labeled && rc.runtimeVerified && bootable && rc.wiringVerified !== true;
      if (claimsRuntimeAbsent || claimsWiringAbsent) {
        const contradiction = detectLabelContradiction(true, hasGreenExecutionEvidence(greenEvidenceSnapshot(existing)));
        if (!contradiction.ok) return errorResult(contradiction.code as GateBlockCode, contradiction.message!);
      }
      const runtimeResult = checkRuntimeVerificationGate(existing.data.chainInfo.testPassedState, rc, bootable);
      if (!runtimeResult.ok) return errorResult(runtimeResult.code as GateBlockCode, runtimeResult.message!);
      if (claimsRuntimeAbsent) {
        newBypassLabels.push({
          kind: "runtimeUnverified",
          reason: rc.unverifiedReason!,
          patchVersion: currentPatchVersion,
          recordedAt: new Date().toISOString(),
        });
      } else if (claimsWiringAbsent) {
        newBypassLabels.push({
          kind: "wiringUnverified",
          reason: rc.unverifiedReason!,
          patchVersion: currentPatchVersion,
          recordedAt: new Date().toISOString(),
        });
      }
    }

    // ── §10 계약테스트 실행증거: config.verificationPolicy.contractEvidenceRequired가 켜져 있으면
    // sugo_record_contract_evidence로 기록된 red→green 전이를 요구한다. resolveContractRequired로
    // §9/§4.3 "undefined면 기본-on 휴리스틱"을 적용한다(contract_done 게이트와 동일 정책 판정).
    const projectConfigForContract = await loadProjectConfig(existing.projectPath);
    const contractRequired = resolveContractRequired(projectConfigForContract?.verificationPolicy?.contractEvidenceRequired, {
      baselineRequired: existing.data.baselineGate?.required ?? false,
    });
    const contractResult = checkContractEvidenceGate(existing.data.chainInfo.contractTests ?? [], contractRequired);
    if (!contractResult.ok) return errorResult(contractResult.code as GateBlockCode, contractResult.message!);
  }

  // ── §10 decompose 오케스트레이션(선택 확장): 매니페스트 결정론 검증(사이클·파일겹침·요구커버리지).
  if (action === "decompose" && existing) {
    if (!args.manifest) return errorResult("MANIFEST_REQUIRED", "decompose action에는 manifest가 필요합니다.");
    if (!existing.data.prdPath) return errorResult("PRD_NOT_FOUND", "decompose 전에 PRD가 필요합니다.");
    const prdContent = await readFile(existing.data.prdPath, "utf-8").catch(() => "");
    const prdRequirementIds = extractRequirements(prdContent).map((r) => r.id);
    const candidateManifest: DecomposeManifest = {
      subtasks: args.manifest.subtasks.map((s) => ({ ...s, status: "pending" as const })),
    };
    const manifestResult = validateManifest(candidateManifest, prdRequirementIds);
    if (!manifestResult.ok) return errorResult(manifestResult.code as GateBlockCode, manifestResult.message!);
  }

  if ((action === "subtask_start" || action === "subtask_done") && existing) {
    if (!args.subtaskId) {
      return errorResult("SUBTASK_ID_REQUIRED", `${action} action에는 subtaskId가 필요합니다.`);
    }
    const subtask = existing.data.decomposeManifest?.subtasks.find((s) => s.id === args.subtaskId);
    if (!subtask) return errorResult("SUBTASK_NOT_FOUND", `서브태스크를 찾을 수 없습니다: ${args.subtaskId}`);
  }

  if (action === "integrate" && existing) {
    const manifest = existing.data.decomposeManifest;
    if (!manifest) return errorResult("MANIFEST_REQUIRED", "integrate 전에 decompose가 필요합니다.");
    const integrationResult = validateIntegration(manifest);
    if (!integrationResult.ok) return errorResult(integrationResult.code as GateBlockCode, integrationResult.message!);

    // ── 통합 게이트: decompose 경로는 integrate가 DOCS_PENDING으로 합류하므로
    // baseline/analyze/wiring/boot 게이트를 하나도 안 거친다.
    //
    // **서브태스크마다 미니 파이프라인을 강제하지는 않는다** — 쪼갠 일을 각자 알아서 하라고
    // 나눈 건데 거기에 또 게이트를 걸면 decompose를 쓸 이유가 없어진다. 대신 **합쳐서 나가는
    // 이 지점 한 번만** code_done과 동일한 내용 게이트를 병합된 변경파일 전체에 적용한다.
    // "각자는 자유, 합류는 검증"이 이 경로의 계약이다.
    const mergedChangedFiles = Array.from(new Set(manifest.subtasks.flatMap((s) => s.changedFiles ?? [])));
    const hasPrd = !!existing.data.prdPath;

    const analyzeGate = checkAnalyzeGate(existing.data.chainInfo.analyzeAttempts, hasPrd);
    if (!analyzeGate.ok) return errorResult(analyzeGate.code as GateBlockCode, analyzeGate.message!);

    const baselineResult = checkBaselineGate(
      existing.data.baselineGate?.required ?? false,
      existing.data.baselineGate?.evidence?.exitCode ?? null,
    );
    if (!baselineResult.ok) return errorResult(baselineResult.code as GateBlockCode, baselineResult.message!);

    const wiringResult = checkWiringGate(mergedChangedFiles, existing.data.mode, args.wiringTestAdded ?? false);
    if (!wiringResult.ok) return errorResult(wiringResult.code as GateBlockCode, wiringResult.message!);

    const bootable = await isProjectBootable(existing.projectPath);
    const bootAnnotationFound = bootable ? await scanForSpringBootTestAnnotation(existing.projectPath) : false;
    const bootResult = checkBootGate(bootable, bootAnnotationFound, args.bootUnverifiedReason);
    if (!bootResult.ok) return errorResult(bootResult.code as GateBlockCode, bootResult.message!);
    if (bootable && !bootAnnotationFound && args.bootUnverifiedReason?.trim()) {
      newBypassLabels.push({
        kind: "bootUnverified",
        reason: args.bootUnverifiedReason,
        patchVersion: currentPatchVersion,
        recordedAt: new Date().toISOString(),
      });
    }
  }

  // ── §7 Patch 진입점: workResultPath가 주어지면 부모 PRD/버전을 미리 계산해둔다.
  // 실패하면 세션을 만들기 전에 차단(오염된 patch 세션이 남지 않게).
  let patchContext: PatchContext | undefined;
  if (action === "start" && args.workResultPath) {
    try {
      patchContext = await resolvePatchContext(args.workResultPath);
    } catch (err) {
      if (err instanceof PatchEntryError) return errorResult(err.code, err.message);
      throw err;
    }
  }

  // ── 순서강제(Gate Keeper) + 상태전이
  const newSessionId = action === "start" ? generateSessionId() : (sessionId as string);
  const result = applyTransition(existing, action, newSessionId, {
    projectPath: args.projectPath,
    featureName: args.featureName,
  });

  if (!result.ok) {
    return errorResult(result.errorCode ?? "UNKNOWN_ERROR", result.message ?? "알 수 없는 오류");
  }

  let session = result.session;

  // status를 세션 없이 호출한 경우(result.session === undefined)는 게이트 반영 없이 바로 응답한다.
  if (!session) {
    const payload = { ok: true, sessionId: undefined, state: undefined, nextActionHints: result.nextActionHints ?? [] };
    return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
  }

  // ── §4.6 label-guard: 콘텐츠 게이트 검사 중 실제로 쓰인 우회 라벨(모순검사 통과분)을 세션에 누적한다.
  if (newBypassLabels.length > 0) {
    session = {
      ...session,
      data: {
        ...session.data,
        chainInfo: {
          ...session.data.chainInfo,
          bypassLabels: [...(session.data.chainInfo.bypassLabels ?? []), ...newBypassLabels],
        },
      },
    };
  }

  // ── §4.5 판단품질 측정용 신호: TEST_DONE/REVIEW_RUNNING에서 code_start로 역방향 재진입하면
  // auto-loop 재시도로 카운트한다(정상 최초 진입 READY→CODE_RUNNING은 카운트하지 않음).
  if (action === "code_start" && existing && (existing.state === "TEST_DONE" || existing.state === "REVIEW_RUNNING")) {
    session = {
      ...session,
      data: {
        ...session.data,
        chainInfo: { ...session.data.chainInfo, autoLoopRetryCount: session.data.chainInfo.autoLoopRetryCount + 1 },
      },
    };
  }

  // ── §10 decompose 오케스트레이션: 매니페스트 생성/서브태스크 상태 갱신/integrate 시 changedFiles 합류.
  if (action === "decompose" && args.manifest) {
    const manifestWithStatus: DecomposeManifest = {
      subtasks: args.manifest.subtasks.map((s) => ({ ...s, status: "pending" as const })),
    };
    session = { ...session, data: { ...session.data, decomposeManifest: manifestWithStatus } };
  }

  if (action === "subtask_start" && args.subtaskId && session.data.decomposeManifest) {
    const updatedSubtasks = session.data.decomposeManifest.subtasks.map((s) =>
      s.id === args.subtaskId ? { ...s, status: "in_progress" as const } : s,
    );
    session = { ...session, data: { ...session.data, decomposeManifest: { subtasks: updatedSubtasks } } };
  }

  if (action === "subtask_done" && args.subtaskId && session.data.decomposeManifest) {
    const updatedSubtasks = session.data.decomposeManifest.subtasks.map((s) =>
      s.id === args.subtaskId ? { ...s, status: "done" as const, changedFiles: args.subtaskChangedFiles ?? [] } : s,
    );
    session = { ...session, data: { ...session.data, decomposeManifest: { subtasks: updatedSubtasks } } };
  }

  if (action === "integrate" && session.data.decomposeManifest) {
    const allChangedFiles = Array.from(
      new Set(session.data.decomposeManifest.subtasks.flatMap((s) => s.changedFiles ?? [])),
    );
    session = {
      ...session,
      data: { ...session.data, chainInfo: { ...session.data.chainInfo, changedFiles: allChangedFiles } },
    };
  }

  // ── §7 Patch: start에서 계산해둔 patch 컨텍스트를 세션에 반영
  if (action === "start" && patchContext) {
    session = {
      ...session,
      data: { ...session.data, mode: "patch", patch: patchContext, featurePath: patchContext.featureDir },
    };
  }

  // ── §7.1 seed(사용자 지시)는 세션에 그대로 보존해뒀다가 review_done이 work-result에 싣는다.
  if (action === "start" && args.seed) {
    session = { ...session, data: { ...session.data, seed: args.seed } };
  }

  // ── §5.0 specOracle 켜기: **경로를 줬다는 주장이 아니라 파일이 실재하는지**를 서버가 확인한다.
  // 존재하지 않는 경로로 게이트를 켜면 영영 못 여는 세션이 되고, 반대로 자기보고만 믿으면
  // "스펙 있다고 했는데 없음"으로 게이트가 무력화된다.
  if (action === "prd" && args.specPath) {
    const specExists = await readFile(args.specPath, "utf-8").then(
      () => true,
      () => false,
    );
    if (specExists) {
      session = {
        ...session,
        data: { ...session.data, specOracle: { required: true, ran: false, specPath: args.specPath } },
      };
    }
  }

  // ── §5.0 oracle_done: 상태는 그대로 두고 대조 사실만 기록한다(ready 게이트의 근거).
  if (action === "oracle_done") {
    const prev = session.data.specOracle ?? { required: false, ran: false };
    session = {
      ...session,
      data: {
        ...session.data,
        specOracle: {
          ...prev,
          ran: true,
          ranAt: new Date().toISOString(),
          uncovered: args.uncovered,
          overrideReason: args.overrideReason,
        },
      },
    };
  }

  // ── 설계안 jira: 선택을 세션에 남긴다. `"new"`는 실제 티켓을 만들지 않는다(스펙상 TODO) —
  // 만드는 척하지 않고 선택만 기록한다.
  if (action === "jira" && args.jiraOption) {
    session = {
      ...session,
      data: {
        ...session.data,
        jira: { option: args.jiraOption, jiraKey: args.jiraKey, recordedAt: new Date().toISOString() },
      },
    };
  }

  // ── 콘텐츠 게이트 통과 후 세션 데이터 반영(+파일 IO)
  if (action === "prd" && args.prdContent) {
    const isPatch = session.data.mode === "patch" && session.data.patch;
    const { featurePath, prdPath } = isPatch
      ? await writePatchPrdFile(session.data.patch!.featureDir, session.data.patch!.version, args.prdContent)
      : await writePrdFile(session.projectPath, session.featureName, args.prdContent);
    const baseline = detectBaselineSignals(args.prdContent);
    session = {
      ...session,
      data: {
        ...session.data,
        featurePath,
        prdPath,
        baselineGate: { required: baseline.required, signals: baseline.signals },
      },
    };

    // ── §8 HULK 연동: 프로젝트가 워크스페이스에 등록돼 있으면 Task를 자동 생성한다.
    // §7.1 Patch 성숙화: patch 모드면 새 Task를 만들지 않고 원본 Run(=Task)을
    // 재사용한다 — base-task 매칭은 ref 파일명 우선(findTaskByPrdRef). 못 찾으면(예: 원본이
    // 워크스페이스 등록 전에 만들어짐) 새 Task로 안전하게 폴백한다(교착 방지).
    const registryEntry = await findRegistryEntry(session.projectPath);
    if (registryEntry?.workspace) {
      let task: Task;
      const baseTask = isPatch ? await findTaskByPrdRef(registryEntry.workspace, session.data.patch!.parentPrdPath) : null;
      if (baseTask) {
        const patchInfo: TaskPatchInfo = {
          parentTaskId: baseTask.id,
          patchVersion: session.data.patch!.version,
          seed: session.data.seed,
        };
        task = (await updateTask(registryEntry.workspace, baseTask.id, { status: "in_progress", patchInfo })) ?? baseTask;
      } else {
        task = await addTask(registryEntry.workspace, {
          title: session.featureName,
          project: session.projectPath,
          status: "in_progress",
          prd_ref: prdPath,
        });
      }
      session = {
        ...session,
        data: { ...session.data, hulkWorkspace: registryEntry.workspace, hulkTaskId: task.id },
      };

      // ── §8.5 Roadmap DAG: task 레벨 노드를 보장하고, PRD의 ### REQ-XXX 헤딩을 자식 REQ
      // 노드(+ 항상 REQ-CONFIRM)로 심는다. 헤딩 형식 REQ가 하나도 없으면 심을 게 없어 no-op.
      // task 노드 상태는 실제 HULK Task와 맞춰 in_progress로 갱신한다 — pending으로 남으면
      // 의존성 없는 이 노드가 readySet에 REQ와 나란히 잘못 섞여 나온다(스모크 테스트가 잡아낸 버그).
      await backfillRoadmapTask(registryEntry.workspace, task.id, session.featureName);
      await updateRoadmapNodeStatus(registryEntry.workspace, task.id, "in_progress");
      const reqNodes = promotePrdRequirements(task.id, args.prdContent);
      if (reqNodes.length > 0) {
        await upsertRoadmapNodes(registryEntry.workspace, reqNodes);
      }
    }
  }

  if (action === "code_done") {
    session = {
      ...session,
      data: {
        ...session.data,
        chainInfo: {
          ...session.data.chainInfo,
          changedFiles: args.changedFiles ?? [],
          codeGateAudit: {
            wiringTestAdded: args.wiringTestAdded,
            dependencyRemoved: args.dependencyRemoved,
            registrationGlueChecked: args.registrationGlueChecked,
            bootUnverifiedReason: args.bootUnverifiedReason,
          },
        },
      },
    };
  }

  if (action === "test_done" && existing?.data.chainInfo.testEvidence) {
    const derivedState = existing.data.chainInfo.testEvidence.derivedState;
    // §10 이중 실행 제거: pass일 때만 지문을 남긴다 — fail/unverified 증거는 재사용 대상이 아니다.
    const testEvidenceFingerprint =
      derivedState === "pass"
        ? await computeChangedFilesFingerprint(session.projectPath, session.data.chainInfo.changedFiles)
        : session.data.chainInfo.testEvidenceFingerprint;
    session = {
      ...session,
      data: {
        ...session.data,
        chainInfo: {
          ...session.data.chainInfo,
          testPassedState: derivedState,
          coverageMap: args.coverageMap,
          testEvidenceFingerprint,
        },
      },
    };
  }

  // ── §2 하네스 도구 디스패치: code_start 순간에 적용된 하네스와 매칭되는 특화 MCP 도구 메뉴를
  // 실어준다(레지스트리가 비어있으면 빈 문자열 — 그게 기본값이다).
  let harnessToolMenu: string | undefined;
  if (action === "code_start") {
    const projectConfig = await loadProjectConfig(session.projectPath);
    const guides = resolveHarnessToolGuides(projectConfig?.appliedHarnesses.map((h) => h.id) ?? []);
    harnessToolMenu = renderToolMenu(guides);
  }

  let humanHoursEstimate: ReturnType<typeof estimateHumanHours> | undefined;
  if (action === "review_done" && args.summary) {
    const featurePath = session.data.featurePath ?? session.projectPath;
    const isPatch = session.data.mode === "patch" && session.data.patch;
    // ── §7.1 seed가 있으면 work-result에 그대로 실어 "이번 차수에
    // 뭘 요청했는지"를 남긴다(reviewSummary와는 별개 — summary는 결과 요약, seed는 최초 지시).
    const workResultContent = session.data.seed ? `${args.summary}\n\n## 사용자 지시(seed)\n${session.data.seed}` : args.summary;
    const { workResultPath } = isPatch
      ? await writePatchWorkResultFile(session.data.patch!.featureDir, session.data.patch!.version, workResultContent)
      : await writeWorkResultFile(featurePath, workResultContent);
    // ── §7.2 calibrated-ratio fetch: 대시보드가 실측 중앙값으로 보정한 비율이 있으면 그걸 쓰고,
    // 없으면(disabled/실패) humanHours.ts의 고정 기본값(3.5)으로 안전하게 폴백한다.
    const calibratedRatio = await fetchCalibratedRatio();
    humanHoursEstimate = estimateHumanHours(
      session.startedAt,
      new Date().toISOString(),
      session.data.chainInfo.analyzeAttempts,
      session.data.chainInfo.autoLoopRetryCount,
      calibratedRatio ?? undefined,
    );
    session = {
      ...session,
      data: {
        ...session.data,
        chainInfo: {
          ...session.data.chainInfo,
          reviewPassed: true,
          workResultPath,
          humanHoursEstimate,
          reviewSummary: args.summary,
          reviewDoneAt: new Date().toISOString(),
          runtimeCheckUnverifiedReason: args.runtimeCheck?.unverifiedReason,
          evidenceReused: args.reusedFromTestDone ?? false,
        },
      },
    };

    // ── §3/§8.5 REQ/REQ-CONFIRM 자동완료: "사용자 확인이 곧 REQ 롤다운"이다. 승격된 REQ가 없는
    // 세션(워크스페이스 미등록, 헤딩 형식 REQ 없음 등)은 completeTaskRequirements 내부에서 조용히
    // no-op하므로 여기서 별도 분기 없이 항상 호출해도 안전하다.
    if (session.data.hulkWorkspace && session.data.hulkTaskId) {
      await completeTaskRequirements(session.data.hulkWorkspace, session.data.hulkTaskId, args.summary);
    }
  }

  // ── §4.6 label-guard: commit 시점에 우회 라벨 누적분으로 completionGrade를 판정한다. 차단은
  // 하지 않는다(교착 방지) — 대신 응답 최상단에 강제 노출해 "조용히 넘어가지 못하게" 한다.
  let completionGrade: "verified" | "unverified" | undefined;
  let bypassSummary: string | undefined;
  if (action === "commit") {
    const gradeResult = computeCompletionGrade(session.data.chainInfo.bypassLabels ?? [], currentPatchVersion);
    completionGrade = gradeResult.grade;
    bypassSummary = renderBypassSummary(gradeResult);
  }

  // ── §8 HULK 연동: commit 시점에 Task를 done으로 전환하고 WorkLog를 기록한다.
  // 매칭되는 checkpoint는 정보성으로만 노출한다(체크리스트 완료 여부는 자기보고라 강제할 수 없음 —
  // sugo_validate와 같은 이유).
  let hulk:
    | { taskId: string; workLogId: string; checkpointsToReview: { id: string; title: string; checklist: string[] }[] }
    | undefined;
  if (action === "commit" && session.data.hulkWorkspace && session.data.hulkTaskId) {
    const workspace = session.data.hulkWorkspace;
    // ── §7.2 prRefs: 완료 시점에 git 원격/브랜치를 읽어 대시보드 "Create PR" 버튼을 급전한다.
    // git 저장소가 아니거나 원격이 없으면 조용히 undefined(막지 않음).
    const prRefs = (await collectPrRefs(session.projectPath)) ?? undefined;
    const workLog = await addWorkLog(workspace, {
      task_id: session.data.hulkTaskId,
      task_title: session.featureName,
      completed_at: new Date().toISOString(),
      summary: session.data.chainInfo.reviewSummary,
      files_changed: session.data.chainInfo.changedFiles,
      metrics: {
        estimatedHumanHours: session.data.chainInfo.humanHoursEstimate?.estimatedHumanHours,
        aiExecutionMinutes: session.data.chainInfo.humanHoursEstimate?.aiExecutionMinutes,
        estimationBasis: session.data.chainInfo.humanHoursEstimate?.estimationBasis,
        userReportedHumanHours: args.userReportedHumanHours,
      },
      prRefs,
    });
    await updateTask(workspace, session.data.hulkTaskId, {
      status: "done",
      summary: session.data.chainInfo.reviewSummary,
      log_id: workLog.id,
    });

    const config = await loadProjectConfig(session.projectPath);
    const checkpoints = await listCheckpoints(workspace);
    const applicable = checkpoints.filter((cp) =>
      checkpointApplies(cp, {
        projectName: config?.projectName ?? session.featureName,
        harnessIds: config?.detectedStack.harnessIds ?? [],
      }),
    );

    hulk = {
      taskId: session.data.hulkTaskId,
      workLogId: workLog.id,
      checkpointsToReview: applicable.map((cp) => ({ id: cp.id, title: cp.title, checklist: cp.checklist })),
    };

    // ── §7.2 Activity Stream: 태스크 완료 이벤트. 논블로킹 — 실패해도 commit 응답엔 영향 없다.
    void emitActivity({
      workspaceName: workspace,
      agent: "MAIN",
      eventType: "COMPLETED",
      message: session.data.chainInfo.reviewSummary ?? `${session.featureName} 완료`,
    });
  }

  if (action !== "status") {
    await saveSession(session);
  }

  const payload = {
    ok: true,
    sessionId: session.id,
    state: session.state,
    completionGrade,
    bypassSummary,
    cancelledAt: session.cancelledAt,
    nextActionHints: result.nextActionHints ?? [],
    humanHoursEstimate,
    prdPath: session.data.prdPath,
    workResultPath: session.data.chainInfo.workResultPath,
    patch:
      session.data.mode === "patch" && session.data.patch
        ? { parentPrdPath: session.data.patch.parentPrdPath, version: session.data.patch.version }
        : undefined,
    hulk,
    decomposeManifest: session.data.decomposeManifest,
    harnessToolMenu,
    // §4.2 "정적검증 미강제" 라벨: test_done에서 npm/py/go 등 풀검증 강제 불가 명령이면 false로
    // 노출한다(gradle/maven이면 true — 그쪽은 게이트가 gradlew check/mvn verify를 이미 강제).
    fullVerifyEnforceable:
      action === "test_done" && session.data.chainInfo.testEvidence
        ? isFullVerifyEnforceable(session.data.chainInfo.testEvidence.command)
        : undefined,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
