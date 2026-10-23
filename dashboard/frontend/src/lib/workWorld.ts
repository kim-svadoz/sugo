import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { selectFloorLanes, type FloorActivity, type FloorStationId } from "./workFloor.js";

/**
 * Home 작업 세계. 메인 에이전트 한 명이 SPEC을 보고 전문 인력(구현·테스트·검토·문서)에게 작업을 지시하고,
 * 사용자 확인을 거쳐 커밋을 출고한다. 위치와 호출된 인력은 실제 활동 이벤트와 일정 데이터로만 정한다.
 */
export type Specialist = "CODE" | "TEST" | "REVIEW" | "DOCS";
export type MainSpot = "desk" | "spec" | "code" | "test" | "review" | "confirm" | "docs" | "dock";

export interface WorldState {
  mainSpot: MainSpot;
  mainActivity: FloorActivity;
  activeSpecialist: Specialist | null;
  /** 진행 중인 모든 작업에서 지금 일하는 인력. 작업이 병렬이면 여러 명이다. */
  activeSpecialists: Specialist[];
  live: boolean;
  domain?: string;
  task?: string;
  message?: string;
  at?: number;
}

const SPECIALIST_AT: Partial<Record<FloorStationId, Specialist>> = { code: "CODE", test: "TEST", review: "REVIEW", docs: "DOCS" };

export function selectWorldState(events: readonly ActivityEvent[], now = Date.now(), context: { waitingReviews?: number; plannedSpecs?: number } = {}): WorldState {
  const lanes = selectFloorLanes(events, now);
  const lead = lanes[0];
  const activeSpecialists = (["CODE", "TEST", "REVIEW", "DOCS"] as const).filter((agent) => lanes.some((lane) => lane.state.live && lane.state.activity === "working" && SPECIALIST_AT[lane.state.station] === agent));
  if (lead?.state.live) {
    const { station, activity, workspace, message, at } = lead.state;
    const specialist = SPECIALIST_AT[station] ?? null;
    const mainSpot: MainSpot = specialist ? station as MainSpot : station === "confirm" ? "confirm" : station === "commit" ? "dock" : "desk";
    return { mainSpot, mainActivity: activity, activeSpecialist: specialist, activeSpecialists, live: true, domain: workspace, task: lead.name, message, at };
  }
  if ((context.waitingReviews ?? 0) > 0) return { mainSpot: "confirm", mainActivity: "waiting", activeSpecialist: null, activeSpecialists, live: false };
  if ((context.plannedSpecs ?? 0) > 0) return { mainSpot: "spec", mainActivity: "working", activeSpecialist: null, activeSpecialists, live: false };
  return { mainSpot: "desk", mainActivity: "resting", activeSpecialist: null, activeSpecialists, live: false, domain: lead?.state.workspace, task: lead?.name, message: lead?.state.message, at: lead?.state.at };
}

/** 이번 주(월요일 시작, 로컬 시간) 요일별 완료 수. Weekly 보고서가 모으는 단위와 같다. */
export function weekBins(specs: ReadonlyArray<{ development_history?: ReadonlyArray<{ completed_at: string | null }> }>, now = new Date()): number[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const bins = [0, 0, 0, 0, 0, 0, 0];
  for (const spec of specs) for (const history of spec.development_history ?? []) {
    if (!history.completed_at) continue;
    const at = new Date(history.completed_at);
    const day = Math.floor((new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() - start.getTime()) / 86_400_000);
    if (day >= 0 && day < 7 && at.getTime() <= now.getTime()) bins[day] += 1;
  }
  return bins;
}
