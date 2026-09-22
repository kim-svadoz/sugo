import { ACTION_TYPES, WORKFLOW_STATES, type ActionName, type WorkflowState } from "./ontology/model.js";
import type { ChainInfo } from "./types.js";

export interface RemainingStep {
  action: ActionName;
  toState: WorkflowState;
  /** 이 액션을 부를 때 반드시 같이 넘겨야 하는 인자. 없으면 빈 배열. */
  requires: string[];
}

export interface CompletionPlan {
  /** 현재 상태에서 DONE까지 밟아야 하는 액션 순서. 이미 DONE이면 빈 배열. */
  remaining: RemainingStep[];
  /** 지금 당장 다음 액션을 막고 있는 것들. 세션 기록에서 뽑은 실측값이지 추정이 아니다. */
  blockers: string[];
}

/**
 * §4.3-P 각 액션이 요구하는 인자. 게이트 자체는 서버가 검사하지만, **무엇을 준비해야 하는지**는
 * 미리 알려줘야 막다른 길에 들어가지 않는다.
 *
 * 여기 없는 액션은 추가 인자가 필요 없다는 뜻이다. `ACTION_TYPES.gates`는 서술용 라벨이라
 * 실제 차단 지점과 다를 수 있어(§2 주의) 쓰지 않고, 실제 스키마가 요구하는 것만 적는다.
 */
const REQUIRED_ARGS: Partial<Record<ActionName, string[]>> = {
  prd: ["prdContent"],
  jira: ["jiraOption"],
  code_done: ["changedFiles"],
  test_done: ["testPassed"],
  review_done: ["summary", "userConfirmed", "runtimeCheck (또는 reusedFromTestDone)"],
};

/**
 * 현재 상태에서 DONE까지의 경로를 앞으로 따라간다. 분기가 있는 상태(예: REVIEW_RUNNING에서
 * code_start로 되돌아가기)는 **주 경로만** 싣는다 — 되돌아가기는 선택지이지 남은 일이 아니다.
 */
export function remainingSteps(state: WorkflowState): RemainingStep[] {
  const steps: RemainingStep[] = [];
  const order = (s: WorkflowState) => WORKFLOW_STATES.indexOf(s);
  let cursor: WorkflowState = state;

  while (cursor !== "DONE") {
    // "전진"은 도착 상태가 WORKFLOW_STATES에서 현재보다 **뒤**인 것이다. 선언 순서로 고르면
    // code_start(REVIEW_RUNNING→CODE_RUNNING) 같은 되돌아가기를 집어 경로가 무한히 돈다.
    // 여러 개면 가장 가까운 상태로 간다.
    //
    // ACTION_TYPES가 const 배열이라 union의 includes 파라미터가 모든 튜플의 교집합(never)으로
    // 좁혀진다 — 리포의 다른 곳과 같이 readonly string[]로 캐스팅해 비교한다.
    const current = cursor;
    const forward = ACTION_TYPES.filter(
      (a) =>
        (a.fromStates as readonly string[] | null)?.includes(current) &&
        a.toState !== null &&
        order(a.toState) > order(current),
    ).sort((x, y) => order(x.toState as WorkflowState) - order(y.toState as WorkflowState))[0];

    if (!forward?.toState) break; // 전진 경로가 없으면 여기서 끝 — 억지로 만들지 않는다.
    steps.push({ action: forward.name, toState: forward.toState, requires: REQUIRED_ARGS[forward.name] ?? [] });
    cursor = forward.toState;
  }
  return steps;
}

/**
 * 지금 다음 액션을 막고 있는 것. 세션에 기록된 값만 본다 — "아직 안 했다"와 "해봤는데 실패했다"를
 * 구분해서, 후자만 blocker로 싣는다(전자는 그냥 다음에 할 일이다).
 */
export function currentBlockers(chain: ChainInfo | undefined): string[] {
  if (!chain) return [];
  const blockers: string[] = [];
  const evidence = chain.testEvidence;
  if (evidence?.failed) blockers.push(`테스트 실패 ${evidence.failed}/${evidence.total ?? "?"}`);
  if (chain.testPassedState === "fail") blockers.push("test_done 시점 판정이 fail — 그린 증거 기록 후 test_reverify 필요");
  if (chain.analyzePassed === false) blockers.push(`analyze 미통과(${chain.analyzeLastVerdict ?? "verdict 없음"})`);
  if (chain.reviewPassed === false) blockers.push("review 미통과");
  return blockers;
}

export function buildCompletionPlan(state: WorkflowState, chain: ChainInfo | undefined): CompletionPlan {
  return { remaining: remainingSteps(state), blockers: currentBlockers(chain) };
}
