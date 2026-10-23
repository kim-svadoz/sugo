import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { parseActivityTime } from "./activityTime.js";

/**
 * 작업자(이름 없는 AI) 장면. 파이프라인이 돌 때는 지금 단계의 동작을, 아닐 때는 화면 성격에 맞는
 * 반복 동작을 보여준다. 진행 중이라는 표시는 실제 활동 이벤트가 있을 때만 쓴다.
 */
export type WorkPose =
  | "reviewing-board" | "sorting" | "planning" | "stacking" | "switching-tools" | "reading-manual"
  | "measuring" | "connecting" | "tuning"
  | "briefing" | "building" | "inspecting" | "reviewing" | "writing" | "celebrating";

export interface WorkScene { pose: WorkPose; live: boolean; label: string; detail?: string }

const LIVE_WINDOW_MS = 15 * 60_000;
const CELEBRATE_WINDOW_MS = 5 * 60_000;

const PAGE_SCENES: Array<[RegExp, WorkPose, string]> = [
  [/^\/home/, "reviewing-board", "오늘 볼 작업을 훑어보는 중"],
  [/^\/(sessions|workspaces|roadmap)/, "sorting", "작업 블록을 프로젝트별로 정리하는 중"],
  [/^\/schedule/, "planning", "일정판에 작업 블록을 놓는 중"],
  [/^\/weekly/, "stacking", "한 주의 결과를 쌓는 중"],
  [/^\/skills/, "switching-tools", "단계별 도구를 바꿔 드는 중"],
  [/^\/playbook/, "reading-manual", "조립 설명서를 넘기는 중"],
  [/^\/harness/, "measuring", "블록이 규격에 맞는지 재는 중"],
  [/^\/(settings|integrations)/, "connecting", "외부 블록을 연결하는 중"],
  [/^\/preferences/, "tuning", "작업 환경을 맞추는 중"],
];

const AGENT_SCENES: Record<string, [WorkPose, string]> = {
  MAIN: ["briefing", "요청을 정리하는 중"],
  CODE: ["building", "구현 중"],
  TEST: ["inspecting", "테스트 중"],
  REVIEW: ["reviewing", "검토 중"],
  DOCS: ["writing", "문서 작성 중"],
};

function pageScene(pathname: string): WorkScene {
  const [, pose, label] = PAGE_SCENES.find(([pattern]) => pattern.test(pathname)) ?? PAGE_SCENES[0];
  return { pose, live: false, label };
}

export function selectWorkScene(pathname: string, events: readonly ActivityEvent[], now = Date.now()): WorkScene {
  const latest = events
    .map((event) => ({ event, at: parseActivityTime(event.ts).getTime() }))
    .filter(({ at }) => Number.isFinite(at))
    .sort((a, b) => b.at - a.at)[0];
  if (!latest || now - latest.at > LIVE_WINDOW_MS) return pageScene(pathname);
  const { event, at } = latest;
  if (event.event_type === "COMPLETED") {
    return now - at <= CELEBRATE_WINDOW_MS ? { pose: "celebrating", live: true, label: "작업 완료", detail: event.message } : pageScene(pathname);
  }
  if (event.event_type === "SYSTEM") return pageScene(pathname);
  const stage = AGENT_SCENES[(event.event_type === "HANDOFF" ? event.handoff_to : event.agent) ?? ""];
  if (!stage) return pageScene(pathname);
  return { pose: stage[0], live: true, label: stage[1], detail: event.message };
}
