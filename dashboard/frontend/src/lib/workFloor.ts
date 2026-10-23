import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { parseActivityTime } from "./activityTime.js";

/**
 * 작업장(Work floor). 코드 작업 하나가 거치는 작업대 중 지금 어디서 무엇을 하는지 고른다.
 * 위치는 실제 활동 이벤트로만 정한다 — 없는 진행을 연출하지 않는다.
 */
export type FloorStationId = "order" | "code" | "test" | "review" | "confirm" | "docs" | "commit";
export type FloorActivity = "working" | "waiting" | "paused" | "resting" | "celebrating";

export const FLOOR_STATIONS: ReadonlyArray<{ id: FloorStationId; label: string; working: string }> = [
  { id: "order", label: "작업 지시", working: "작업을 나눠 지시하는 중" },
  { id: "code", label: "구현", working: "코드를 조립하는 중" },
  { id: "test", label: "테스트", working: "테스트를 돌려 확인하는 중" },
  { id: "review", label: "검토", working: "검토 자료를 맞춰 보는 중" },
  { id: "confirm", label: "사용자 확인", working: "사용자 확인을 기다리는 중" },
  { id: "docs", label: "문서", working: "작업 결과를 기록하는 중" },
  { id: "commit", label: "커밋", working: "커밋할 결과를 포장하는 중" },
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
export interface FloorLane { key: string; name: string; taskId?: string; projectPath?: string; workspace: string; state: FloorState }

export const LIVE_WINDOW_MS = 15 * 60_000;
const CELEBRATE_WINDOW_MS = 5 * 60_000;
const AGENT_STATION: Record<string, FloorStationId> = { MAIN: "order", CODE: "code", TEST: "test", REVIEW: "review", DOCS: "docs" };

function detailsOf(event: ActivityEvent): { task?: { id?: unknown; name?: unknown; specId?: unknown; projectPath?: unknown }; stage?: unknown } {
  return event.details && typeof event.details === "object" ? event.details as { task?: { id?: unknown; name?: unknown; specId?: unknown; projectPath?: unknown }; stage?: unknown } : {};
}

/** 작업 묶음 키. 플러그인이 보낸 task.id를 쓰고, 그 전의 이벤트는 메시지 첫 단어(작업 이름)로 묶는다. */
export function eventTask(event: ActivityEvent): { key: string; name: string; taskId?: string; projectPath?: string } {
  const task = detailsOf(event).task;
  if (task && typeof task.id === "string") return { key: `${event.workspace_name}:${task.id}`, name: typeof task.name === "string" ? task.name : task.id, taskId: task.id, ...(typeof task.projectPath === "string" ? { projectPath: task.projectPath } : {}) };
  const name = event.message.trim().replace(/\s+(?:구현 시작|구현 재진입|테스트 인계|리뷰 인계|문서화 인계|완료 처리 인계)$/, "") || event.workspace_name;
  return { key: `${event.workspace_name}:${name}`, name };
}

export function stationOf(event: ActivityEvent): FloorStationId | null {
  if (event.event_type === "COMPLETED") return "commit";
  if (event.event_type === "HANDOFF") {
    if (event.agent === "DOCS" && event.handoff_to === "MAIN") return "commit";
    return AGENT_STATION[event.handoff_to ?? ""] ?? null;
  }
  if (event.event_type === "EXECUTE") return detailsOf(event).stage === "user_confirmation" ? "confirm" : AGENT_STATION[event.agent ?? ""] ?? null;
  return null;
}

export function passedBefore(station: FloorStationId): FloorStationId[] {
  return FLOOR_STATIONS.slice(0, FLOOR_STATIONS.findIndex((item) => item.id === station)).map((item) => item.id);
}

export function placeEvents(events: readonly ActivityEvent[]) {
  return events
    .map((event) => ({ event, at: parseActivityTime(event.ts).getTime(), station: stationOf(event) }))
    .filter((item): item is { event: ActivityEvent; at: number; station: FloorStationId } => Number.isFinite(item.at) && item.station !== null)
    .sort((a, b) => b.at - a.at);
}

export function selectFloorState(events: readonly ActivityEvent[], now = Date.now(), context: { waitingReviews?: number } = {}): FloorState {
  const placed = placeEvents(events);
  const lastAt: FloorState["lastAt"] = {};
  for (const item of placed) lastAt[item.station] ??= { message: item.event.message, at: item.at };
  const latest = placed[0];
  const base = latest ? { workspace: latest.event.workspace_name, message: latest.event.message, at: latest.at, lastAt } : { lastAt };
  if (latest?.station === "confirm") return { ...base, station: "confirm", activity: "waiting", live: true, passed: passedBefore("confirm") };
  if (latest && now - latest.at <= LIVE_WINDOW_MS) {
    const celebrating = latest.event.event_type === "COMPLETED";
    if (!celebrating || now - latest.at <= CELEBRATE_WINDOW_MS) {
      return { ...base, station: latest.station, activity: celebrating ? "celebrating" : "working", live: true, passed: passedBefore(latest.station) };
    }
  }
  if ((context.waitingReviews ?? 0) > 0) return { station: "confirm", activity: "waiting", live: false, passed: [], lastAt };
  if (!latest) return { station: "order", activity: "resting", live: false, passed: [], lastAt };
  const finished = latest.station === "commit";
  return { ...base, station: latest.station, activity: finished ? "resting" : "paused", live: false, passed: finished ? [] : passedBefore(latest.station) };
}

/**
 * 이벤트를 작업별로 묶는다. 작업 식별자가 없는 옛 COMPLETED 이벤트는 메시지가 검토 요약이라 작업 이름이 없으므로,
 * 같은 도메인에서 직전에 진행된 작업에 붙인다.
 */
export function groupByTask(events: readonly ActivityEvent[]): Map<string, { name: string; taskId?: string; projectPath?: string; workspace: string; events: ActivityEvent[] }> {
  const groups = new Map<string, { name: string; taskId?: string; projectPath?: string; workspace: string; events: ActivityEvent[] }>();
  const lastKey = new Map<string, { key: string; name: string; taskId?: string; projectPath?: string }>();
  const ordered = [...events].sort((a, b) => parseActivityTime(a.ts).getTime() - parseActivityTime(b.ts).getTime());
  for (const event of ordered) {
    const legacy = !detailsOf(event).task;
    const task = legacy && event.event_type === "COMPLETED" && lastKey.has(event.workspace_name) ? lastKey.get(event.workspace_name)! : eventTask(event);
    if (event.event_type !== "SYSTEM") lastKey.set(event.workspace_name, task);
    const group = groups.get(task.key) ?? { name: task.name, taskId: task.taskId, projectPath: task.projectPath, workspace: event.workspace_name, events: [] };
    group.events.push(event);
    groups.set(task.key, group);
  }
  return groups;
}

/** 작업별 레인. 진행 중(최근 이벤트 또는 확인 대기)인 작업을 모두 보여주고, 없으면 가장 최근 작업 하나만 보여준다. */
export function selectFloorLanes(events: readonly ActivityEvent[], now = Date.now(), max = 8): FloorLane[] {
  const lanes = [...groupByTask(events).entries()]
    .map(([key, group]) => ({ key, name: group.name, taskId: group.taskId, projectPath: group.projectPath, workspace: group.workspace, state: selectFloorState(group.events, now) }))
    .filter((lane) => lane.state.at !== undefined)
    .sort((a, b) => (b.state.at ?? 0) - (a.state.at ?? 0));
  const live = lanes.filter((lane) => lane.state.live).sort((a, b) => {
    const priority = (lane: FloorLane) => lane.state.activity === "waiting" ? 0 : 1;
    return priority(a) - priority(b) || (b.state.at ?? 0) - (a.state.at ?? 0);
  });
  return (live.length > 0 ? live : lanes.slice(0, 1)).slice(0, max);
}
