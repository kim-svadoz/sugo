export function blockerResumePrompt(input: {
  workspace: string;
  taskId: string;
  taskTitle: string;
  question: string;
  response: string;
  sessionId?: string;
  resumeAction?: string;
}): string {
  return [
    "Sugo의 차단된 작업을 아래 사용자 결정에 따라 이어가줘.",
    `workspace: ${input.workspace}`,
    `task: ${input.taskId} · ${input.taskTitle}`,
    `차단 질문: ${input.question}`,
    `사용자 결정: ${input.response}`,
    ...(input.sessionId ? [
      `먼저 sugo_roadmap(action:"resume_with_decision", workspace:"${input.workspace}", id:"${input.taskId}", sessionId:"${input.sessionId}")을 호출해 저장된 결정을 검증하고 소비해.`,
      input.resumeAction ? `검증 성공 후 원래 세션 ${input.sessionId}에서 sugo_plan(action:"${input.resumeAction}") 단계로 돌아가.` : "검증 성공 후 원래 Sugo 세션에서 작업을 이어가.",
    ] : ["현재 저장소 상태와 Task 컨텍스트를 다시 확인한 뒤 재개해."]),
    "대시보드 결정 검증 전에는 완료/재개 상태를 추정하지 마.",
  ].join("\n");
}
