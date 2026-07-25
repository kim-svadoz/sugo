export interface CheckpointMatchContext {
  projectName: string;
  harnessIds: string[];
}

/**
 * applies_to가 비어있으면 보편 체크포인트(항상 적용). 아니면 프로젝트명이나 적용된 harnessId와
 * 겹칠 때만 적용된다. 순수 함수 — 체크리스트 완료 여부는 판단하지 않는다(자기보고를 신뢰할 수
 * 없어 하드 게이트로 쓰지 않기로 한 결정은 roadmap-progress.md 참고, sugo_validate와 같은 이유).
 */
export function checkpointApplies(checkpoint: { applies_to?: string[] }, ctx: CheckpointMatchContext): boolean {
  const applies = checkpoint.applies_to;
  if (!applies || applies.length === 0) return true;
  return applies.some((tag) => tag === ctx.projectName || ctx.harnessIds.includes(tag));
}
