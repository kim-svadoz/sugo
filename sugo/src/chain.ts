export type ChangeType = "feature" | "bugfix" | "refactor";
export type ChainDirection = "code_to_test" | "test_to_review";

export interface ChainHandoff {
  project: string;
  changedFiles: string[];
  changeType: ChangeType;
  summary: string;
  prdPath?: string;
  sessionId: string;
}

function buildCodeToTestPrompt(handoff: ChainHandoff): string {
  return [
    "# test-agent 핸드오프",
    "",
    `프로젝트: ${handoff.project}`,
    `변경 유형: ${handoff.changeType}`,
    `변경 파일: ${handoff.changedFiles.length > 0 ? handoff.changedFiles.join(", ") : "(없음)"}`,
    `PRD: ${handoff.prdPath ?? "(없음)"}`,
    "",
    "## 요약",
    handoff.summary,
    "",
    "## test-agent 지시사항",
    "- PRD를 oracle 삼아 명세에서 테스트를 도출하세요. 구현 코드를 보고 따라짜지 마세요(순환검증 방지).",
    "- 기존 테스트를 먼저 전량 실행해 회귀 baseline을 확인하세요(신규 실패=spec_not_met, 기존 실패=regression으로 구분).",
    "- 완료 후 반드시 sugo_record_test_evidence로 실행 결과를 기록하세요 — 이 기록만이 test_done 게이트가 신뢰하는 증거입니다.",
  ].join("\n");
}

function buildTestToReviewPrompt(handoff: ChainHandoff): string {
  return [
    "# review-agent 핸드오프 (읽기 전용)",
    "",
    `프로젝트: ${handoff.project}`,
    `변경 유형: ${handoff.changeType}`,
    `변경 파일: ${handoff.changedFiles.length > 0 ? handoff.changedFiles.join(", ") : "(없음)"}`,
    `PRD: ${handoff.prdPath ?? "(없음)"}`,
    "",
    "## 요약",
    handoff.summary,
    "",
    "## review-agent 지시사항",
    "- 코드를 수정하지 마세요. review-agent는 읽기 전용입니다.",
    "- sugo_get_project_context로 적용된 하네스 규칙을 로드한 뒤, sugo_validate로 검증 결과를 제출하세요.",
    "- 검증이 끝나면 터미널에 긴 work-result를 출력해 확인을 묻지 마세요.",
    "- 작업 요약·변경·테스트·설계 결정·알려진 한계를 reviewPacket으로 구조화해 메인 에이전트에 반환하세요.",
    "- 메인 에이전트는 sugo_roadmap(action:'request_review_confirmation', ...)으로 reviewPacket을 Dashboard에 게시해야 합니다.",
    "- Dashboard 결정을 resume_with_decision으로 확인한 뒤, 사용자가 진행을 승인한 경우에만 review_done(userConfirmed:true)을 호출해야 합니다.",
    "- 결정이 '수정 필요'이면 review_done을 호출하지 말고, 적힌 수정 내용을 code-agent에 전달하세요.",
  ].join("\n");
}

/** §5: sugo_chain — 에이전트 체인 핸드오프 객체 + 프롬프트 생성(순수 함수). */
export function buildChainPrompt(direction: ChainDirection, handoff: ChainHandoff): string {
  return direction === "code_to_test" ? buildCodeToTestPrompt(handoff) : buildTestToReviewPrompt(handoff);
}
