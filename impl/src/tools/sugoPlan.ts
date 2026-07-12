import { z } from "zod";
import { isProjectBootable } from "../bootable.js";
import { scanForSpringBootTestAnnotation } from "../bootScan.js";
import { writePatchPrdFile, writePatchWorkResultFile, writePrdFile, writeWorkResultFile } from "../feature.js";
import { checkCoverageGate } from "../consistency.js";
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
  type GateBlockCode,
  type RuntimeCheck,
} from "../gates.js";
import { loadProjectConfig } from "../harness/config.js";
import { findRegistryEntry } from "../harness/registry.js";
import { estimateHumanHours } from "../humanHours.js";
import { checkpointApplies } from "../hulk/matching.js";
import { addWorkLog } from "../hulk/history.js";
import { listCheckpoints } from "../hulk/checkpoint.js";
import { addTask, updateTask } from "../hulk/task.js";
import { PatchEntryError, resolvePatchContext, type PatchContext } from "../patch.js";
import { applyTransition } from "../planStateMachine.js";
import { generateSessionId, loadSession, saveSession, sessionExists } from "../session.js";
import { checkTestEvidenceGate } from "../testEvidence.js";
import { PLAN_ACTIONS, type PlanSession } from "../types.js";

export const sugoPlanInputSchema = {
  action: z.enum(PLAN_ACTIONS).describe("파이프라인 상태머신 액션"),
  sessionId: z.string().optional().describe("start 이외의 모든 action에 필요. start 결과로 발급됨"),
  projectPath: z.string().optional().describe("start action에 필요"),
  featureName: z.string().optional().describe("start action에 선택적으로 사용"),
  workResultPath: z
    .string()
    .optional()
    .describe("start action: patch 진입점(§7) — 기존 work-result.md(또는 work-result-patch-vN.md) 경로. 미입력시 기존(신규 PRD) 동작"),
  prdContent: z.string().optional().describe("prd action에 필요. 본문 ≥100자, REQ-N 태그 ≥1"),
  changedFiles: z.array(z.string()).optional().describe("code_done action에서 이번 코딩으로 바뀐 파일 목록"),
  dependencyRemoved: z.boolean().optional().describe("code_done: 의존성을 제거/내재화했는지(registration-glue 게이트 트리거)"),
  registrationGlueChecked: z.boolean().optional().describe("code_done: 등록 글루(빈 등록 메타) diff를 점검했는지"),
  wiringTestAdded: z.boolean().optional().describe("code_done: 배선/설정 변경에 대해 mock 없는 배선 테스트를 추가/검증했는지"),
  bootUnverifiedReason: z.string().optional().describe("code_done: boot-gate를 환경부재로 우회할 때의 사유 라벨"),
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

  // ── 콘텐츠 게이트(§4): 순서강제(prerequisite)와 별개로 액션별 페이로드를 검증한다.
  // 상태 전이 전에 막아야 "READY로 되돌아갔다가 재시도" 같은 오염된 중간상태가 안 남는다.
  if (action === "prd") {
    if (!args.prdContent) return errorResult("PRD_CONTENT_REQUIRED", "prd action에는 prdContent가 필요합니다.");
    const validation = validatePrd(args.prdContent);
    if (!validation.ok) {
      return errorResult(
        validation.errors[0],
        `PRD 검증 실패: 길이=${validation.length}자(≥100 필요), REQ 태그=${validation.reqCount}개(≥1 필요)`,
      );
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
    const bootResult = checkBootGate(bootable, bootAnnotationFound, args.bootUnverifiedReason);
    if (!bootResult.ok) return errorResult(bootResult.code as GateBlockCode, bootResult.message!);
  }

  if (action === "test_done" && existing) {
    if (args.testPassed === undefined) {
      return errorResult("TEST_PASSED_REQUIRED", "test_done action에는 testPassed가 필요합니다.");
    }
    const evidenceResult = checkTestEvidenceGate(args.testPassed, existing.data.chainInfo.testEvidence ?? null);
    if (!evidenceResult.ok) return errorResult(evidenceResult.code as GateBlockCode, evidenceResult.message!);

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

    if (!args.runtimeCheck) return errorResult("RUNTIME_CHECK_REQUIRED", "review_done action에는 runtimeCheck가 필요합니다.");
    const bootable = await isProjectBootable(existing.projectPath);
    const runtimeResult = checkRuntimeVerificationGate(
      existing.data.chainInfo.testPassedState,
      args.runtimeCheck as RuntimeCheck,
      bootable,
    );
    if (!runtimeResult.ok) return errorResult(runtimeResult.code as GateBlockCode, runtimeResult.message!);
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

  // ── §7 Patch: start에서 계산해둔 patch 컨텍스트를 세션에 반영
  if (action === "start" && patchContext) {
    session = {
      ...session,
      data: { ...session.data, mode: "patch", patch: patchContext, featurePath: patchContext.featureDir },
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
    const registryEntry = await findRegistryEntry(session.projectPath);
    if (registryEntry?.workspace) {
      const task = await addTask(registryEntry.workspace, {
        title: session.featureName,
        project: session.projectPath,
        status: "in_progress",
        prd_ref: prdPath,
      });
      session = {
        ...session,
        data: { ...session.data, hulkWorkspace: registryEntry.workspace, hulkTaskId: task.id },
      };
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
    session = {
      ...session,
      data: {
        ...session.data,
        chainInfo: {
          ...session.data.chainInfo,
          testPassedState: existing.data.chainInfo.testEvidence.derivedState,
          coverageMap: args.coverageMap,
        },
      },
    };
  }

  let humanHoursEstimate: ReturnType<typeof estimateHumanHours> | undefined;
  if (action === "review_done" && args.summary) {
    const featurePath = session.data.featurePath ?? session.projectPath;
    const isPatch = session.data.mode === "patch" && session.data.patch;
    const { workResultPath } = isPatch
      ? await writePatchWorkResultFile(session.data.patch!.featureDir, session.data.patch!.version, args.summary)
      : await writeWorkResultFile(featurePath, args.summary);
    humanHoursEstimate = estimateHumanHours(
      session.startedAt,
      new Date().toISOString(),
      session.data.chainInfo.analyzeAttempts,
      session.data.chainInfo.autoLoopRetryCount,
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
        },
      },
    };
  }

  // ── §8 HULK 연동: commit 시점에 Task를 done으로 전환하고 WorkLog를 기록한다.
  // 매칭되는 checkpoint는 정보성으로만 노출한다(체크리스트 완료 여부는 자기보고라 강제할 수 없음 —
  // sugo_validate와 같은 이유. roadmap-progress.md 참고).
  let hulk:
    | { taskId: string; workLogId: string; checkpointsToReview: { id: string; title: string; checklist: string[] }[] }
    | undefined;
  if (action === "commit" && session.data.hulkWorkspace && session.data.hulkTaskId) {
    const workspace = session.data.hulkWorkspace;
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
  }

  if (action !== "status") {
    await saveSession(session);
  }

  const payload = {
    ok: true,
    sessionId: session.id,
    state: session.state,
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
