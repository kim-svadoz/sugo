import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { FLOOR_STATIONS, eventTask, selectFloorLanes, selectFloorState } from "./workFloor.js";

const NOW = Date.parse("2026-10-23T03:00:00Z");
let nextId = 1;
function event(partial: Partial<ActivityEvent> & { ts: string }): ActivityEvent {
  return { id: nextId++, workspace_name: "payments", level: "info", agent: null, handoff_to: null, event_type: "HANDOFF", message: "login-limit 진행", details: { task: { id: "t-login", name: "로그인 실패 제한" } }, ...partial };
}

describe("eventTask", () => {
  it("플러그인이 보낸 작업 식별자를 쓴다", () => {
    expect(eventTask(event({ ts: "2026-10-23 02:00:00" }))).toEqual({ key: "payments:t-login", name: "로그인 실패 제한", taskId: "t-login" });
  });

  it("식별자가 없는 옛 이벤트는 메시지 첫 단어(작업 이름)로 묶는다", () => {
    expect(eventTask(event({ ts: "2026-10-23 02:00:00", details: undefined, message: "infinite-scroll 테스트 인계" }))).toEqual({ key: "payments:infinite-scroll", name: "infinite-scroll" });
  });
});

describe("selectFloorState", () => {
  it("작업대는 작업 지시부터 커밋까지 파이프라인 순서를 따르고 검토와 문서 사이에 사용자 확인이 있다", () => {
    expect(FLOOR_STATIONS.map((station) => station.id)).toEqual(["order", "code", "test", "review", "confirm", "docs", "commit"]);
  });

  it.each([["CODE", "code"], ["TEST", "test"], ["REVIEW", "review"], ["DOCS", "docs"]])("방금 %s 단계로 인계되면 그 작업대에서 일한다", (handoff, station) => {
    expect(selectFloorState([event({ ts: "2026-10-23 02:58:00", agent: "MAIN", handoff_to: handoff })], NOW)).toMatchObject({ station, activity: "working", live: true });
  });

  it("검토 결과를 게시하면 사용자 확인 작업대에서 사람을 기다린다", () => {
    const events = [event({ ts: "2026-10-23 02:58:00", agent: "REVIEW", event_type: "EXECUTE", details: { task: { id: "t-login", name: "로그인 실패 제한" }, stage: "user_confirmation" } })];
    expect(selectFloorState(events, NOW)).toMatchObject({ station: "confirm", activity: "waiting", passed: ["order", "code", "test", "review"] });
  });

  it("확인 대기는 시간이 지나도 사람이 답할 때까지 유지한다", () => {
    const events = [event({ ts: "2026-10-22 02:58:00", agent: "REVIEW", event_type: "EXECUTE", details: { task: { id: "t-login" }, stage: "user_confirmation" } })];
    expect(selectFloorState(events, NOW)).toMatchObject({ station: "confirm", activity: "waiting" });
  });

  it("문서 작업이 끝나 MAIN으로 넘어가면 커밋대에서 마무리하고, 완료 직후에는 축하한다", () => {
    expect(selectFloorState([event({ ts: "2026-10-23 02:59:00", agent: "DOCS", handoff_to: "MAIN" })], NOW)).toMatchObject({ station: "commit", activity: "working" });
    expect(selectFloorState([event({ ts: "2026-10-23 02:58:00", agent: "MAIN", event_type: "COMPLETED" })], NOW)).toMatchObject({ station: "commit", activity: "celebrating" });
  });

  it("진행 중이 아니면 멈춘 작업대에 남고, 끝난 작업은 커밋대에서 쉰다", () => {
    expect(selectFloorState([event({ ts: "2026-10-23 01:00:00", agent: "CODE", handoff_to: "TEST" })], NOW)).toMatchObject({ station: "test", activity: "paused", live: false });
    expect(selectFloorState([event({ ts: "2026-10-22 09:00:00", agent: "MAIN", event_type: "COMPLETED" })], NOW)).toMatchObject({ station: "commit", activity: "resting" });
    expect(selectFloorState([], NOW)).toMatchObject({ station: "order", activity: "resting" });
  });

  it("작업대마다 그곳의 마지막 이벤트를 남기고 SYSTEM 이벤트는 위치를 바꾸지 않는다", () => {
    const events = [
      event({ ts: "2026-10-23 02:40:00", agent: "MAIN", handoff_to: "CODE", message: "구현 시작" }),
      event({ ts: "2026-10-23 02:50:00", agent: "CODE", handoff_to: "TEST", message: "구현 완료" }),
      event({ ts: "2026-10-23 02:59:00", agent: "MAIN", event_type: "SYSTEM", message: "동기화" }),
    ];
    const state = selectFloorState(events, NOW);
    expect(state.station).toBe("test");
    expect(state.lastAt.code?.message).toBe("구현 시작");
  });
});

describe("selectFloorLanes", () => {
  it("같은 도메인에서 동시에 진행 중인 작업은 작업별 레인으로 나눈다", () => {
    const events = [
      event({ ts: "2026-10-23 02:50:00", agent: "MAIN", handoff_to: "CODE" }),
      event({ ts: "2026-10-23 02:55:00", agent: "CODE", handoff_to: "TEST", details: { task: { id: "t-search", name: "검색 필터" } } }),
    ];
    const lanes = selectFloorLanes(events, NOW);
    expect(lanes.map((lane) => [lane.name, lane.state.station])).toEqual([["검색 필터", "test"], ["로그인 실패 제한", "code"]]);
  });

  it("진행 중인 작업이 없으면 오래전에 멈춘 작업이 아니라 가장 최근 완료 작업을 보여준다", () => {
    const events = [
      event({ ts: "2026-10-22 02:50:00", agent: "MAIN", event_type: "COMPLETED" }),
      event({ ts: "2026-10-21 02:55:00", agent: "CODE", handoff_to: "TEST", details: { task: { id: "t-search", name: "검색 필터" } } }),
    ];
    expect(selectFloorLanes(events, NOW).map((lane) => lane.name)).toEqual(["로그인 실패 제한"]);
  });

  it("식별자가 없던 옛 이벤트도 마지막 COMPLETED를 직전 파이프라인 작업에 붙인다", () => {
    const events = [
      event({ ts: "2026-10-21 01:45:40", details: undefined, agent: "CODE", handoff_to: "TEST", message: "infinite-scroll-discovery 테스트 인계" }),
      event({ ts: "2026-10-21 01:57:55", details: undefined, agent: "REVIEW", handoff_to: "DOCS", message: "infinite-scroll-discovery 문서화 인계" }),
      event({ ts: "2026-10-21 01:58:09", details: undefined, agent: "DOCS", handoff_to: "MAIN", message: "infinite-scroll-discovery 완료 처리 인계" }),
      event({ ts: "2026-10-21 01:58:22", details: undefined, agent: "MAIN", event_type: "COMPLETED", message: "order-scroll 최종 결과" }),
    ];
    const [lane] = selectFloorLanes(events, NOW);
    expect(lane).toMatchObject({ name: "infinite-scroll-discovery", state: { station: "commit", activity: "resting" } });
  });

  it("사용자 확인을 기다리는 작업은 진행 중 레인으로 남는다", () => {
    const events = [
      event({ ts: "2026-10-22 02:50:00", agent: "REVIEW", event_type: "EXECUTE", details: { task: { id: "t-a", name: "A" }, stage: "user_confirmation" } }),
      event({ ts: "2026-10-23 02:58:00", agent: "MAIN", handoff_to: "CODE", details: { task: { id: "t-b", name: "B" } } }),
    ];
    expect(selectFloorLanes(events, NOW).map((lane) => lane.name)).toEqual(["A", "B"]);
  });

  it("사용자 확인, 진행, 일시 정지, 최근 완료 순으로 전환 대상을 정렬한다", () => {
    const events = [
      event({ ts: "2026-10-22 02:50:00", agent: "REVIEW", event_type: "EXECUTE", details: { task: { id: "wait", name: "확인" }, stage: "user_confirmation" } }),
      event({ ts: "2026-10-23 02:58:00", agent: "MAIN", handoff_to: "CODE", details: { task: { id: "live", name: "진행" } } }),
    ];
    expect(selectFloorLanes(events, NOW).map((lane) => lane.name)).toEqual(["확인", "진행"]);
  });
});
