import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { FLOOR_STATIONS, selectFloorState } from "./workFloor.js";

const NOW = Date.parse("2026-10-23T03:00:00Z");
let nextId = 1;
function event(partial: Partial<ActivityEvent> & { ts: string }): ActivityEvent {
  return { id: nextId++, workspace_name: "payments", level: "info", agent: null, handoff_to: null, event_type: "HANDOFF", message: "로그인 실패 제한", ...partial };
}

describe("selectFloorState", () => {
  it("작업대는 파이프라인 순서를 따른다", () => {
    expect(FLOOR_STATIONS.map((station) => station.id)).toEqual(["brief", "code", "test", "review", "docs", "done"]);
  });

  it.each([
    ["CODE", "code"], ["TEST", "test"], ["REVIEW", "review"], ["DOCS", "docs"],
  ])("방금 %s 단계로 인계되면 그 작업대에서 일한다", (handoff, station) => {
    const state = selectFloorState([event({ ts: "2026-10-23 02:58:00", agent: "MAIN", handoff_to: handoff })], NOW);
    expect(state).toMatchObject({ station, activity: "working", live: true, workspace: "payments", message: "로그인 실패 제한" });
  });

  it("앞선 작업대는 지나온 단계로 표시한다", () => {
    const state = selectFloorState([event({ ts: "2026-10-23 02:58:00", agent: "TEST", handoff_to: "REVIEW" })], NOW);
    expect(state.passed).toEqual(["brief", "code", "test"]);
  });

  it("문서 작업이 끝나 MAIN으로 넘어가면 완료대에서 마무리한다", () => {
    expect(selectFloorState([event({ ts: "2026-10-23 02:59:00", agent: "DOCS", handoff_to: "MAIN" })], NOW)).toMatchObject({ station: "done", activity: "working" });
  });

  it("완료 직후에는 완료대에서 축하한다", () => {
    expect(selectFloorState([event({ ts: "2026-10-23 02:58:00", agent: "MAIN", event_type: "COMPLETED" })], NOW)).toMatchObject({ station: "done", activity: "celebrating", live: true });
  });

  it("확인할 리뷰가 있고 진행 중인 작업이 없으면 검토대에서 사람을 기다린다", () => {
    expect(selectFloorState([], NOW, { waitingReviews: 2 })).toMatchObject({ station: "review", activity: "waiting", live: false });
  });

  it("진행 중이 아니고 마지막 이벤트가 중간 단계면 그 작업대에서 멈춘 상태로 남는다", () => {
    const stale = [event({ ts: "2026-10-23 01:00:00", agent: "CODE", handoff_to: "TEST" })];
    expect(selectFloorState(stale, NOW)).toMatchObject({ station: "test", activity: "paused", live: false, at: Date.parse("2026-10-23T01:00:00Z") });
  });

  it("마지막 실행이 끝났으면 완료대에서 쉰다", () => {
    const done = [event({ ts: "2026-10-22 09:00:00", agent: "MAIN", event_type: "COMPLETED" })];
    expect(selectFloorState(done, NOW)).toMatchObject({ station: "done", activity: "resting" });
  });

  it("기록이 없으면 요청 정리대에서 새 요청을 기다린다", () => {
    expect(selectFloorState([], NOW)).toMatchObject({ station: "brief", activity: "resting", live: false });
  });

  it("작업대마다 그곳의 마지막 이벤트를 남긴다", () => {
    const events = [
      event({ ts: "2026-10-23 02:40:00", agent: "MAIN", handoff_to: "CODE", message: "구현 시작" }),
      event({ ts: "2026-10-23 02:50:00", agent: "CODE", handoff_to: "TEST", message: "구현 완료" }),
    ];
    const state = selectFloorState(events, NOW);
    expect(state.lastAt.code?.message).toBe("구현 시작");
    expect(state.lastAt.test?.message).toBe("구현 완료");
  });

  it("SYSTEM 이벤트는 위치를 바꾸지 않는다", () => {
    const events = [
      event({ ts: "2026-10-23 02:50:00", agent: "CODE", handoff_to: "TEST" }),
      event({ ts: "2026-10-23 02:59:00", agent: "MAIN", event_type: "SYSTEM", message: "동기화" }),
    ];
    expect(selectFloorState(events, NOW).station).toBe("test");
  });
});
