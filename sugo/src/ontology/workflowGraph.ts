import {
  ACTION_TYPES,
  INTENTIONAL_WORKFLOW_CYCLES,
  WORKFLOW_STATES,
  type IntentionalWorkflowCycle,
  type WorkflowState,
} from "./model.js";

interface WorkflowTransition {
  name: string;
  fromStates: readonly string[] | null;
  toState: string | null;
}

export interface WorkflowCycle {
  states: WorkflowState[];
}

export interface WorkflowGraphAnalysis {
  unreachableFromInit: WorkflowState[];
  cannotReachDone: WorkflowState[];
  cycles: WorkflowCycle[];
  unexpectedCycles: WorkflowCycle[];
  staleCycleDeclarations: IntentionalWorkflowCycle[];
}

function reachable(start: WorkflowState, edges: Map<WorkflowState, Set<WorkflowState>>): Set<WorkflowState> {
  const seen = new Set<WorkflowState>();
  const pending = [start];
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) ?? []) pending.push(next);
  }
  return seen;
}

function reachableFromSeeds(seeds: readonly WorkflowState[], edges: Map<WorkflowState, Set<WorkflowState>>): Set<WorkflowState> {
  const seen = new Set<WorkflowState>();
  for (const seed of seeds) {
    for (const state of reachable(seed, edges)) seen.add(state);
  }
  return seen;
}

function stronglyConnectedComponents(
  states: readonly WorkflowState[],
  edges: Map<WorkflowState, Set<WorkflowState>>,
): WorkflowState[][] {
  let index = 0;
  const indices = new Map<WorkflowState, number>();
  const lowLinks = new Map<WorkflowState, number>();
  const stack: WorkflowState[] = [];
  const onStack = new Set<WorkflowState>();
  const components: WorkflowState[][] = [];

  const visit = (state: WorkflowState) => {
    indices.set(state, index);
    lowLinks.set(state, index);
    index += 1;
    stack.push(state);
    onStack.add(state);

    for (const next of edges.get(state) ?? []) {
      if (!indices.has(next)) {
        visit(next);
        lowLinks.set(state, Math.min(lowLinks.get(state)!, lowLinks.get(next)!));
      } else if (onStack.has(next)) {
        lowLinks.set(state, Math.min(lowLinks.get(state)!, indices.get(next)!));
      }
    }

    if (lowLinks.get(state) === indices.get(state)) {
      const component: WorkflowState[] = [];
      let member: WorkflowState;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== state);
      components.push(component);
    }
  };

  for (const state of states) if (!indices.has(state)) visit(state);
  return components;
}

const cycleKey = (states: readonly WorkflowState[]) => [...states].sort().join("|");

/** 선언된 상태·액션 그래프를 분석한다. 런타임이나 파일 I/O를 읽지 않는 순수 검증 함수다. */
export function analyzeWorkflowGraph(
  states: readonly WorkflowState[],
  transitions: readonly WorkflowTransition[],
  allowedCycles: readonly IntentionalWorkflowCycle[],
): WorkflowGraphAnalysis {
  const known = new Set<string>(states);
  const edges = new Map<WorkflowState, Set<WorkflowState>>(states.map((state) => [state, new Set()]));
  const reverse = new Map<WorkflowState, Set<WorkflowState>>(states.map((state) => [state, new Set()]));
  for (const transition of transitions) {
    if (!transition.fromStates || !transition.toState || !known.has(transition.toState)) continue;
    const to = transition.toState as WorkflowState;
    for (const fromValue of transition.fromStates) {
      if (!known.has(fromValue)) continue;
      const from = fromValue as WorkflowState;
      edges.get(from)!.add(to);
      reverse.get(to)!.add(from);
    }
  }

  // start는 fromStates:null인 세션 경계 액션이다. DONE→새 세션 재시작을 현재 세션 cycle로
  // 섞지 않되, INIT에서 최초 진입하는 상태는 도달성 seed로 포함한다.
  const startDestinations = transitions
    .filter((transition) => transition.name === "start" && transition.toState && known.has(transition.toState))
    .map((transition) => transition.toState as WorkflowState);
  const fromInit = reachableFromSeeds(["INIT", ...startDestinations], edges);
  const toDone = reachable("DONE", reverse);
  if (startDestinations.some((state) => toDone.has(state))) toDone.add("INIT");
  const order = new Map(states.map((state, position) => [state, position]));
  const cycles = stronglyConnectedComponents(states, edges)
    .filter((component) => component.length > 1 || edges.get(component[0])?.has(component[0]))
    .map((component) => ({ states: component.sort((a, b) => order.get(a)! - order.get(b)!) }))
    .sort((a, b) => order.get(a.states[0])! - order.get(b.states[0])!);
  const actualKeys = new Set(cycles.map((cycle) => cycleKey(cycle.states)));
  const allowedKeys = new Set(allowedCycles.map((cycle) => cycleKey(cycle.states)));

  return {
    unreachableFromInit: states.filter((state) => !fromInit.has(state)),
    cannotReachDone: states.filter((state) => state !== "DONE" && !toDone.has(state)),
    cycles,
    unexpectedCycles: cycles.filter((cycle) => !allowedKeys.has(cycleKey(cycle.states))),
    staleCycleDeclarations: allowedCycles.filter((cycle) => !actualKeys.has(cycleKey(cycle.states))),
  };
}

/** 전체 조회·모델 해시·CI가 공유하는 현재 선언의 결정적 분석값. */
export const WORKFLOW_GRAPH_ANALYSIS = analyzeWorkflowGraph(
  WORKFLOW_STATES,
  ACTION_TYPES,
  INTENTIONAL_WORKFLOW_CYCLES,
);
