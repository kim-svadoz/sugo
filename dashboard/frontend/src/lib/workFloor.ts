import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { parseActivityTime } from "./activityTime.js";

/**
 * 작업장(Work floor). 파이프라인 순서대로 놓인 작업대 중 작업자가 지금 어디서 무엇을 하는지 고른다.
 * 위치는 실제 활동 이벤트와 확인 대기 수로만 정한다 — 없는 진행을 연출하지 않는다.
 */
export type FloorStationId = "brief" | "code" | "test" | "review" | "docs" | "done";
export type FloorActivity = "working" | "waiting" | "paused" | "resting" | "celebrating";

export const FLOOR_STATIONS: ReadonlyArray<{ id: FloorStationId; label: string; working: string }> = [
  { id: "brief", label: "요청 정리", working: "요청과 범위를 정리하는 중" },
  { id: "code", label: "구현", working: "코드를 조립하는 중" },
  { id: "test", label: "테스트", working: "테스트를 돌려 확인하는 중" },
  { id: "review", label: "검토", working: "검토 자료를 맞춰 보는 중" },
  { id: "docs", label: "문서", working: "작업 결과를 기록하는 중" },
  { id: "done", label: "완료", working: "커밋할 결과를 포장하는 중" },
];

export interface FloorEvent { message: string; at: number }
export interface FloorState {
  station: FloorStationId;
  activity: FloorActivity;
  live: boolean;
  passed: FloorStationId[];
  workspace?: string;
  message?: string;
  at?: number;
  lastAt: Partial<Record<FloorStationId, FloorEvent>>;
}

const LIVE_WINDOW_MS = 15 * 60_000;
const CELEBRATE_WINDOW_MS = 5 * 60_000;
const AGENT_STATION: Record<string, FloorStationId> = { MAIN: "brief", CODE: "code", TEST: "test", REVIEW: "review", DOCS: "docs" };

function stationOf(event: ActivityEvent): FloorStationId | null {
  if (event.event_type === "COMPLETED") return "done";
  if (event.event_type === "HANDOFF") {
    if (event.agent === "DOCS" && event.handoff_to === "MAIN") return "done";
    return AGENT_STATION[event.handoff_to ?? ""] ?? null;
  }
  if (event.event_type === "EXECUTE") return AGENT_STATION[event.agent ?? ""] ?? null;
  return null;
}

function passedBefore(station: FloorStationId): FloorStationId[] {
  const index = FLOOR_STATIONS.findIndex((item) => item.id === station);
  return FLOOR_STATIONS.slice(0, index).map((item) => item.id);
}

export function selectFloorState(events: readonly ActivityEvent[], now = Date.now(), context: { waitingReviews?: number } = {}): FloorState {
  const placed = events
    .map((event) => ({ event, at: parseActivityTime(event.ts).getTime(), station: stationOf(event) }))
    .filter((item): item is { event: ActivityEvent; at: number; station: FloorStationId } => Number.isFinite(item.at) && item.station !== null)
    .sort((a, b) => b.at - a.at);
  const lastAt: FloorState["lastAt"] = {};
  for (const item of placed) lastAt[item.station] ??= { message: item.event.message, at: item.at };

  const latest = placed[0];
  if (latest && now - latest.at <= LIVE_WINDOW_MS) {
    const celebrating = latest.event.event_type === "COMPLETED";
    if (!celebrating || now - latest.at <= CELEBRATE_WINDOW_MS) {
      return { station: latest.station, activity: celebrating ? "celebrating" : "working", live: true, passed: passedBefore(latest.station), workspace: latest.event.workspace_name, message: latest.event.message, at: latest.at, lastAt };
    }
  }
  if ((context.waitingReviews ?? 0) > 0) return { station: "review", activity: "waiting", live: false, passed: [], lastAt };
  if (!latest) return { station: "brief", activity: "resting", live: false, passed: [], lastAt };
  const finished = latest.station === "done";
  return { station: latest.station, activity: finished ? "resting" : "paused", live: false, passed: finished ? [] : passedBefore(latest.station), workspace: latest.event.workspace_name, message: latest.event.message, at: latest.at, lastAt };
}
