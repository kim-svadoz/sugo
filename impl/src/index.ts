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
import { handleSugoExplore, sugoExploreInputSchema } from "./tools/sugoExplore.js";
import {
  handleSugoGetProjectContext,
  sugoGetProjectContextInputSchema,
} from "./tools/sugoGetProjectContext.js";
import { handleSugoHistory, sugoHistoryInputSchema } from "./tools/sugoHistory.js";
import {
  handleSugoJudgmentReport,
  sugoJudgmentReportInputSchema,
} from "./tools/sugoJudgmentReport.js";
import { handleSugoPlan, sugoPlanInputSchema } from "./tools/sugoPlan.js";
import {
  handleSugoRecordContractEvidence,
  sugoRecordContractEvidenceInputSchema,
} from "./tools/sugoRecordContractEvidence.js";
import {
  handleSugoRecordTestEvidence,
  sugoRecordTestEvidenceInputSchema,
} from "./tools/sugoRecordTestEvidence.js";
import { handleSugoSpec, sugoSpecInputSchema } from "./tools/sugoSpec.js";
import { handleSugoTask, sugoTaskInputSchema } from "./tools/sugoTask.js";
import { handleSugoValidate, sugoValidateInputSchema } from "./tools/sugoValidate.js";
import { handleSugoWorkspace, sugoWorkspaceInputSchema } from "./tools/sugoWorkspace.js";

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
      "capability는 호출자가 명시적으로 제공해야 한다(자동 추측 안 함)(§10).",
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
      "sugo/CLAUDE.md(합성 인덱스), 적용된 개별 하네스 본문, .claude/rules/*.md(있으면)를 읽어 " +
      "서브에이전트가 작업 전 로드해야 하는 컨텍스트를 모아준다(§5).",
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
      "커밋 전 재발방지 체크리스트를 관리한다(add/list). applies_to가 비어있으면 보편 " +
      "체크포인트로 항상 적용되고, 아니면 프로젝트명/harnessId와 매칭될 때만 적용된다(§8).",
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
  "sugo_judgment_report",
  {
    title: "Cross-session judgment quality report (observation layer, not wired into gates)",
    description:
      "누적된 세션 파일들을 횡단 집계해 patch 재진입률, review→commit 갭, 환경부재(우회구) " +
      "남용률, auto-loop 재시도, 조작된 검증 보고 세션 수 등을 리포트한다. 파이프라인을 막지 " +
      "않는 순수 관측 계층이다(§4.5).",
    inputSchema: sugoJudgmentReportInputSchema,
  },
  handleSugoJudgmentReport,
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("sugo MCP server failed to start:", err);
  process.exit(1);
});
