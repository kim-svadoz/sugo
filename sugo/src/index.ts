import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { handleSugoAdd, sugoAddInputSchema } from "./tools/sugoAdd.js";
import { handleSugoAnalyze, sugoAnalyzeInputSchema } from "./tools/sugoAnalyze.js";
import { handleSugoChain, sugoChainInputSchema } from "./tools/sugoChain.js";
import {
  handleSugoCheckLethalTrifecta,
  sugoCheckLethalTrifectaInputSchema,
} from "./tools/sugoCheckLethalTrifecta.js";
import { handleSugoCheckpoint, sugoCheckpointInputSchema } from "./tools/sugoCheckpoint.js";
import { syncPluginVersion, syncUser } from "./dashboard/sync.js";
import { currentSugoVersion } from "./version.js";
import { handleSugoDelete, sugoDeleteInputSchema } from "./tools/sugoDelete.js";
import { handleSugoDisable, sugoDisableInputSchema } from "./tools/sugoDisable.js";
import { handleSugoEnable, sugoEnableInputSchema } from "./tools/sugoEnable.js";
import { handleSugoExplore, sugoExploreInputSchema } from "./tools/sugoExplore.js";
import {
  handleSugoGetProjectContext,
  sugoGetProjectContextInputSchema,
} from "./tools/sugoGetProjectContext.js";
import { handleSugoHistory, sugoHistoryInputSchema } from "./tools/sugoHistory.js";
import { handleSugoOverview, sugoOverviewInputSchema } from "./tools/sugoOverview.js";
import { handleSugoPlan, sugoPlanInputSchema } from "./tools/sugoPlan.js";
import {
  handleSugoRecordContractEvidence,
  sugoRecordContractEvidenceInputSchema,
} from "./tools/sugoRecordContractEvidence.js";
import {
  handleSugoRecordTestEvidence,
  sugoRecordTestEvidenceInputSchema,
} from "./tools/sugoRecordTestEvidence.js";
import { handleSugoReset, sugoResetInputSchema } from "./tools/sugoReset.js";
import { handleSugoRoadmap, sugoRoadmapInputSchema } from "./tools/sugoRoadmap.js";
import { handleSugoRoute, sugoRouteInputSchema } from "./tools/sugoRoute.js";
import { handleSugoSpec, sugoSpecInputSchema } from "./tools/sugoSpec.js";
import { handleSugoSpecWriter, sugoSpecWriterInputSchema } from "./tools/sugoSpecWriter.js";
import { handleSugoStatus, sugoStatusInputSchema } from "./tools/sugoStatus.js";
import { handleSugoTask, sugoTaskInputSchema } from "./tools/sugoTask.js";
import { handleSugoUpdate, sugoUpdateInputSchema } from "./tools/sugoUpdate.js";
import { handleSugoValidate, sugoValidateInputSchema } from "./tools/sugoValidate.js";
import { handleSugoVersion, sugoVersionInputSchema } from "./tools/sugoVersion.js";
import { handleSugoOntology, sugoOntologyInputSchema } from "./tools/sugoOntology.js";
import { handleSugoPrd, sugoPrdInputSchema } from "./tools/sugoPrd.js";
import { handleSugoSetup, sugoSetupInputSchema } from "./tools/sugoSetup.js";
import { handleSugoCommit, sugoCommitInputSchema } from "./tools/sugoCommit.js";
import { migrateWorkDataDir } from "./work/storage.js";
import { handleSugoWorkspace, sugoWorkspaceInputSchema } from "./tools/sugoWorkspace.js";
import { handleSugoAwsContext, sugoAwsContextInputSchema } from "./tools/sugoAwsContext.js";

const server = new McpServer({
  name: "sugo",
  version: "0.1.0",
});

server.registerTool(
  "sugo_plan",
  {
    title: "Sugo pipeline state machine",
    description:
      "code→test→review→docs→commit 파이프라인 상태머신. action으로 단계를 전이하며, 전제상태 미충족 시 차단된다.",
    inputSchema: sugoPlanInputSchema,
  },
  handleSugoPlan,
);

server.registerTool(
  "sugo_add",
  {
    title: "Register a project with Sugo (stack detection + harness synthesis)",
    description:
      "프로젝트 기술스택을 감지해 로컬 하네스 라이브러리에서 코딩표준을 합성하고 sugo/CLAUDE.md, " +
      "sugo/harness/**, sugo/config.json을 생성한 뒤 전역 레지스트리에 등록한다.",
    inputSchema: sugoAddInputSchema,
  },
  handleSugoAdd,
);

server.registerTool(
  "sugo_analyze",
  {
    title: "Cross-validate PRD requirements against changed files",
    description:
      "PRD의 REQ-* 요구사항 키워드를 변경파일 콘텐츠와 대조해 pass/partial/fail을 판정한다. " +
      "code_done 게이트는 이 도구의 실제 호출 이력(analyzeAttempts)만 확인하며, 파라미터로 전달된 " +
      "analyzePassed 같은 자기보고는 신뢰하지 않는다(§4.1).",
    inputSchema: sugoAnalyzeInputSchema,
  },
  handleSugoAnalyze,
);

server.registerTool(
  "sugo_record_test_evidence",
  {
    title: "Record test execution evidence (tamper-resistant)",
    description:
      "테스트/빌드 실행 결과를 세션에 기록한다. test_done/code_done(baseline) 게이트는 이 기록만을 " +
      "진실로 취급하며, 다른 도구 호출의 testPassed 주장은 이 기록과 대조될 뿐이다(§4.2).",
    inputSchema: sugoRecordTestEvidenceInputSchema,
  },
  handleSugoRecordTestEvidence,
);

server.registerTool(
  "sugo_record_contract_evidence",
  {
    title: "Record contract test red→green transition evidence",
    description:
      "계약테스트의 red(구현 전 실패)/green(구현 후 통과) 단계를 각각 기록한다. review_done의 " +
      "contractEvidenceRequired 게이트는 이 red→green 전이만 신뢰하며, green만 있고 red가 " +
      "없으면(자기보고 승격) 거부한다(§10).",
    inputSchema: sugoRecordContractEvidenceInputSchema,
  },
  handleSugoRecordContractEvidence,
);

server.registerTool(
  "sugo_check_lethal_trifecta",
  {
    title: "Check registered tools for the lethal trifecta risk pattern",
    description:
      "(사설데이터 접근 + 신뢰할 수 없는 입력 처리 + 외부 통신)이 한 도구에 동시에 있으면 경고한다. " +
      "capability는 호출자가 명시적으로 제공해야 한다(자동 추측 안 함)(§10). " +
      "§P6-1: review_done 전 최소 1회 호출이 하드 게이트다(LETHAL_TRIFECTA_NOT_CALLED) — " +
      "경고가 있으면 review_done의 trifectaMitigation도 함께 필요하다.",
    inputSchema: sugoCheckLethalTrifectaInputSchema,
  },
  handleSugoCheckLethalTrifecta,
);

server.registerTool(
  "sugo_chain",
  {
    title: "Generate agent chain handoff (code→test / test→review)",
    description:
      "세션의 현재 상태(CODE_DONE/TEST_DONE)로 방향을 판단해 다음 에이전트에게 넘길 핸드오프 " +
      "객체와 프롬프트를 생성한다. code→test는 PRD를 oracle로 삼으라 지시하고, test→review는 " +
      "읽기전용 원칙을 명시한다(§5).",
    inputSchema: sugoChainInputSchema,
  },
  handleSugoChain,
);

server.registerTool(
  "sugo_get_project_context",
  {
    title: "Load project context for sub-agents",
    description:
      "sugo/CLAUDE.md(합성 인덱스), 적용된 개별 하네스 본문, .claude/rules/의 팀 전용 규칙(하네스가 " +
      "쓴 파일 제외 — 그건 Claude Code가 자동로드하므로 harnesses에만 싣는다)을 읽어 서브에이전트가 " +
      "작업 전 로드해야 하는 컨텍스트를 모아준다(§5). changedFiles를 주면 관련 하네스만 선별한다.",
    inputSchema: sugoGetProjectContextInputSchema,
  },
  handleSugoGetProjectContext,
);

server.registerTool(
  "sugo_validate",
  {
    title: "Cross-check submitted validation results against harness rules",
    description:
      "review-agent가 제출한 검증 결과를 프로젝트에 실제 정의된 validation.yaml과 대조한다. " +
      "존재하지 않는 checkId를 보고하면 fabricated로 분리해 판정에서 배제한다(§5).",
    inputSchema: sugoValidateInputSchema,
  },
  handleSugoValidate,
);

server.registerTool(
  "sugo_aws_context",
  {
    title: "Dashboard AWS context snapshot (readOnly)",
    description:
      "Dashboard에 사용자가 연결하고 마지막으로 새로고침한 AWS 리소스 스냅샷을 읽는다. " +
      "환경 미지정 시 default(team-shared), dev/stg/prd 지정 시 대응 환경 계정을 읽는다. " +
      "AWS를 직접 조회하지 않으며 기본 응답은 서비스별 개수만 반환한다.",
    inputSchema: sugoAwsContextInputSchema,
  },
  handleSugoAwsContext,
);

server.registerTool(
  "sugo_workspace",
  {
    title: "HULK workspace CRUD + free-form memory",
    description:
      "관련 프로젝트를 묶는 워크스페이스를 관리한다(add/list/get). remember/recall로 " +
      "워크스페이스별 자유 메모(memory.md)도 누적할 수 있다(§8).",
    inputSchema: sugoWorkspaceInputSchema,
  },
  handleSugoWorkspace,
);

server.registerTool(
  "sugo_task",
  {
    title: "HULK task CRUD",
    description:
      "워크스페이스 단위 작업 태스크를 관리한다(add/list/update/get). sugo_plan(prd)이 " +
      "워크스페이스 등록된 프로젝트에 대해 자동으로 in_progress 태스크를 생성한다(§8).",
    inputSchema: sugoTaskInputSchema,
  },
  handleSugoTask,
);

server.registerTool(
  "sugo_checkpoint",
  {
    title: "HULK checkpoint CRUD (pre-commit reminders)",
    description:
      "커밋 전 재발방지 체크리스트를 관리한다(add/get/list/remove/memory/read_memory/migrate/sync). " +
      "applies_to가 비어있으면 보편 체크포인트로 항상 적용되고, 아니면 프로젝트명/harnessId와 " +
      "매칭될 때만 적용된다. sync는 대시보드로 push만 한다(pull은 미구현, §7.2/§8).",
    inputSchema: sugoCheckpointInputSchema,
  },
  handleSugoCheckpoint,
);

server.registerTool(
  "sugo_spec",
  {
    title: "HULK long-lived spec knowledge CRUD",
    description: "아키텍처/API설계/비즈니스룰 등 장기 지식을 관리한다(add/list/get)(§8).",
    inputSchema: sugoSpecInputSchema,
  },
  handleSugoSpec,
);

server.registerTool(
  "sugo_spec_writer",
  {
    title: "Dashboard SPEC writer bridge",
    description: "Schedule SPEC 초안 컨텍스트를 읽고 완성된 spec.md 경로를 다시 연결한다. feat 시작 뒤에는 수정이 거부된다. complete는 구현 경로·줄 번호·커밋 해시 문구가 있으면 SPEC_LINT_WARNINGS로 연결을 보류하며, 사용자 승인 뒤에만 acceptLintWarnings:true로 재호출한다.",
    inputSchema: sugoSpecWriterInputSchema,
  },
  handleSugoSpecWriter,
);

server.registerTool(
  "sugo_history",
  {
    title: "HULK work log CRUD",
    description:
      "완료 작업 이력(WorkLog)을 관리한다(add/list/get). sugo_plan(commit)이 워크스페이스 " +
      "등록된 프로젝트에 대해 자동으로 기록하지만, 파이프라인 밖 작업도 수동으로 남길 수 있다(§8).",
    inputSchema: sugoHistoryInputSchema,
  },
  handleSugoHistory,
);


server.registerTool(
  "sugo_roadmap",
  {
    title: "Roadmap DAG (§8.5) — dependsOn-ordered task/requirement graph",
    description:
      "워크스페이스별 로드맵 DAG와 사람 결정 차단을 관리한다(add/remove/status/link/unlink/group/backfill/list/ready/get/" +
      "mark_req/pull_ordering/block_for_human/resume_with_decision). 사람 차단은 구조화된 상황·질문·선택지·영향을 기록하고, " +
      "Dashboard 결정을 같은 sessionId에서 검증해야만 재개한다. link/unlink는 task 레벨 노드끼리만 허용되고(fail-closed), 사이클을 " +
      "만드는 변경은 전부 거부된다. REQ-CONFIRM(`{taskId}::REQ-CONFIRM`)은 이 도구의 mark_req로 " +
      "직접 완료할 수 없다 — sugo_plan(review_done)이 성공할 때만 자동 완료된다. pull_ordering은 " +
      "대시보드에서 dependsOn/manual_status/pos_x/pos_y(대시보드가 SOT인 필드만)를 가져와 병합한다(§8.5/§7.2).",
    inputSchema: sugoRoadmapInputSchema,
  },
  handleSugoRoadmap,
);

server.registerTool(
  "sugo_explore",
  {
    title: "AST-based codebase exploration (not regex)",
    description:
      "web-tree-sitter로 실제 파싱해 클래스·인터페이스·메서드·함수·import를 추출한다 " +
      "(TypeScript/TSX/JavaScript/Python/Java 지원). code-agent가 코딩 전 구조를 이해하는 용도(§D.7).",
    inputSchema: sugoExploreInputSchema,
  },
  handleSugoExplore,
);

server.registerTool(
  "sugo_update",
  {
    title: "Re-sync harness for an already-registered project",
    description:
      "이미 sugo_add로 등록된 프로젝트의 스택감지·하네스를 다시 돈다(sugo_add와 동작 공유). " +
      "등록돼 있지 않으면 거부한다 — 신규 등록은 sugo_add의 책임(§9).",
    inputSchema: sugoUpdateInputSchema,
  },
  handleSugoUpdate,
);

server.registerTool(
  "sugo_disable",
  {
    title: "Mark a registered project as disabled",
    description: "프로젝트를 비활성 표시한다(sugo/config.json.disabled=true). sugo_status에 노출된다(§9).",
    inputSchema: sugoDisableInputSchema,
  },
  handleSugoDisable,
);

server.registerTool(
  "sugo_enable",
  {
    title: "Re-enable a disabled project",
    description: "sugo_disable로 비활성화된 프로젝트를 다시 활성화한다(§9).",
    inputSchema: sugoEnableInputSchema,
  },
  handleSugoEnable,
);

server.registerTool(
  "sugo_reset",
  {
    title: "Reset applied harness state for a project",
    description:
      "적용된 하네스 산출물(sugo/harness/**, CLAUDE.md 내용)만 지운다 — 레지스트리 등록·감지된 " +
      "스택 정보는 유지한다. 기존 CLAUDE.md는 sugo/backup/으로 백업한다(§9).",
    inputSchema: sugoResetInputSchema,
  },
  handleSugoReset,
);

server.registerTool(
  "sugo_delete",
  {
    title: "Unregister a project from the global registry",
    description:
      "레지스트리(등록 목록)에서만 제거한다 — 프로젝트의 실제 파일(sugo/**)은 지우지 않는다(§9).",
    inputSchema: sugoDeleteInputSchema,
  },
  handleSugoDelete,
);

server.registerTool(
  "sugo_status",
  {
    title: "Local dashboard of all registered projects (readOnly)",
    description: "등록된 모든 프로젝트의 상태(활성화 여부, 적용 하네스 수, 감지된 스택 등)를 모아 보여준다(§9).",
    inputSchema: sugoStatusInputSchema,
  },
  handleSugoStatus,
);

server.registerTool(
  "sugo_overview",
  {
    title: "Whole-project AST-based structural onboarding",
    description:
      "sugo_explore(파일 목록을 직접 지정)와 달리 프로젝트 전체를 스스로 걸어(최대 200개 파일) " +
      "tree-sitter로 파싱한 구조 요약 JSON을 만든다(§9/§D.7).",
    inputSchema: sugoOverviewInputSchema,
  },
  handleSugoOverview,
);

server.registerTool(
  "sugo_route",
  {
    title: "Route a natural-language request to (agent, skill)",
    description:
      "파이프라인 밖 단발 요청(\"이거 버그 고쳐줘\", \"리뷰해줘\")의 자연어 의도를 (agent, skill)로 " +
      "매핑한다(§5b). 이번 빌드 최소셋: code(implement/bugfix/refactor)·test(targeted/full)·" +
      "review(validate/security)·docs(readme).",
    inputSchema: sugoRouteInputSchema,
  },
  handleSugoRoute,
);

// 이름은 반드시 `sugo_` 접두어를 유지한다 — 여기만 bare `version`이었는데, MCP 도구명은
// 클라이언트에서 서버들 사이 전역으로 노출되므로 다른 서버의 `version`과 부딪힐 수 있다.
server.registerTool(
  "sugo_version",
  {
    title: "Plugin version (readOnly)",
    description: "플러그인 버전을 반환한다. 원격 마켓플레이스가 구성돼 있지 않아 업데이트 확인은 지원하지 않는다(§1/§D.1).",
    inputSchema: sugoVersionInputSchema,
  },
  handleSugoVersion,
);

server.registerTool(
  "sugo_ontology",
  {
    title: "Operational ontology (readOnly)",
    description:
      "§2 오퍼레이셔널 온톨로지 조회 — 상태·액션·전제·소유권·불변식·경계의 정본. view로 섹션을 좁히거나 boundary(handoff|sync|lifecycle|workflow)로 그 이음새의 계약과 불변식을 함께 본다.",
    inputSchema: sugoOntologyInputSchema,
  },
  handleSugoOntology,
);

server.registerTool(
  "sugo_setup",
  {
    title: "Integration setup (Bitbucket/Jira)",
    description:
      "§1 연동 설정. 이 로컬 빌드는 값을 저장하지 않고 어디서 설정해야 하는지만 알린다(토큰은 대시보드가 암호화 보관).",
    inputSchema: sugoSetupInputSchema,
  },
  handleSugoSetup,
);

server.registerTool(
  "sugo_commit",
  {
    title: "Conventional Commit message (generate only)",
    description:
      "§7 Conventional Commit 메시지를 생성한다. DONE 상태에서만 동작하며 저장소를 바꾸지는 않는다(생성만).",
    inputSchema: sugoCommitInputSchema,
  },
  handleSugoCommit,
);

server.registerTool(
  "sugo_prd",
  {
    title: "DEPRECATED — use sugo_plan(action:prd)",
    description:
      "§1 폐기된 도구. 무조건 거부하고 sugo_plan(action:prd)로 안내한다 — 상태머신을 우회하는 PRD 생성은 게이트를 통째로 빠져나가는 뒷문이었다.",
    inputSchema: sugoPrdInputSchema,
  },
  handleSugoPrd,
);

async function main() {
  // §9 WORK 리네임(hulk/ → work/): 어떤 도구든 데이터를 읽기 **전에** 끝나야 하므로 await한다.
  // 절대 던지지 않게 만들어져 있어 실패해도 기동을 막지 않는다(못 옮긴 파일은 마커를 안 남겨
  // 다음 부팅에 재시도된다).
  await migrateWorkDataDir();

  // §7.2: 서버 기동 시 1회, 논블로킹으로 플러그인 버전/사용자를 대시보드에 알린다(disabled면 조용히 no-op).
  void syncPluginVersion(currentSugoVersion());
  void syncUser();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("sugo MCP server failed to start:", err);
  process.exit(1);
});
