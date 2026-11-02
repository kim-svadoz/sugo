import { FLOOR_STATIONS, type FloorLane, type FloorStationId } from "./workFloor.js";

/**
 * 도메인 관리 화면의 상태 표현. 도메인 목록 묶음과 상태 카드가 같은 판정을 쓴다.
 * 판정은 작업장 레인(실제 활동 이벤트)과 로드맵 확인 필요 건수로만 한다.
 */
export type DomainTone = "waiting" | "live" | "quiet";
export interface DomainPulse { tone: DomainTone; label: string; at: number | null }

const LIVE_LABEL: Record<FloorStationId, string> = {
  order: "작업 지시 중",
  code: "구현 중",
  test: "테스트 중",
  review: "검토 중",
  confirm: "확인 대기",
  docs: "문서 정리 중",
  commit: "커밋 중",
};
const stationLabel = (id: FloorStationId) => FLOOR_STATIONS.find((station) => station.id === id)!.label;

export function domainPulse(summary: { attentionCount: number; attentionLabel: string | null; lastActivityAt: string | null }, lanes: readonly FloorLane[]): DomainPulse {
  const lastAt = summary.lastActivityAt ? Date.parse(summary.lastActivityAt) : null;
  const waiting = lanes.find((lane) => lane.state.activity === "waiting");
  if (waiting) return { tone: "waiting", label: "확인 대기", at: waiting.state.at ?? lastAt };
  const lane = lanes[0];
  if (lane?.state.live) return { tone: "live", label: lane.state.activity === "celebrating" ? "방금 완료" : LIVE_LABEL[lane.state.station], at: lane.state.at ?? lastAt };
  if (summary.attentionCount > 0) return { tone: "waiting", label: summary.attentionLabel ?? "확인 필요", at: lane?.state.at ?? lastAt };
  if (!lane) return { tone: "quiet", label: lastAt === null ? "기록 없음" : "작업 대기", at: lastAt };
  const label = lane.state.activity === "paused" ? `${stationLabel(lane.state.station)}에서 멈춤` : "커밋 완료";
  return { tone: "quiet", label, at: lane.state.at ?? lastAt };
}

const GROUPS: ReadonlyArray<{ tone: DomainTone; title: string }> = [
  { tone: "waiting", title: "내 확인 필요" },
  { tone: "live", title: "진행 중" },
  { tone: "quiet", title: "조용함" },
];

export function groupDomainsByPulse<T extends { pulse: DomainPulse }>(items: readonly T[]): Array<{ tone: DomainTone; title: string; items: T[] }> {
  return GROUPS
    .map((group) => ({ ...group, items: items.filter((item) => item.pulse.tone === group.tone).sort((a, b) => (b.pulse.at ?? -1) - (a.pulse.at ?? -1)) }))
    .filter((group) => group.items.length > 0);
}

export type StageTone = "waiting" | "live" | "done" | "paused" | "rest";

/** 상태 카드 첫 줄. 선택한 작업이 지금 어디서 무엇을 하는지 한 문장으로 말한다. */
export function stageHeadline(lane: FloorLane | undefined): { tone: StageTone; text: string } {
  if (!lane) return { tone: "rest", text: "아직 작업 기록이 없어요" };
  const { state } = lane;
  if (state.activity === "waiting") return { tone: "waiting", text: "사용자 확인을 기다려요" };
  if (state.activity === "celebrating") return { tone: "done", text: "작업을 마쳤어요" };
  if (state.live) return { tone: "live", text: `${stationLabel(state.station)} 진행 중` };
  if (state.activity === "paused") return { tone: "paused", text: `${stationLabel(state.station)}에서 멈췄어요` };
  return { tone: "rest", text: "다음 작업을 기다려요" };
}
