import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { selectWorldState, taskTimelines, weekBins } from "./workWorld.js";

const NOW = Date.parse("2026-10-23T03:00:00Z");
let nextId = 1;
function event(partial: Partial<ActivityEvent> & { ts: string }): ActivityEvent {
  return { id: nextId++, workspace_name: "harbor", level: "info", agent: null, handoff_to: null, event_type: "HANDOFF", message: "진행", details: { task: { id: "t-1", name: "선박 검수 화면" } }, ...partial };
}

describe("selectWorldState", () => {
  it.each([["CODE", "code"], ["TEST", "test"], ["REVIEW", "review"], ["DOCS", "docs"]] as const)("%s 단계가 진행 중이면 메인이 그 전문 인력 부스에서 작업을 지시하고 그 인력만 일한다", (agent, spot) => {
    const state = selectWorldState([event({ ts: "2026-10-23 02:58:00", agent: "MAIN", handoff_to: agent })], NOW);
    expect(state).toMatchObject({ mainSpot: spot, activeSpecialist: agent, live: true, domain: "harbor", task: "선박 검수 화면" });
  });

  it("사용자 확인을 기다리면 메인이 확인 창구에서 기다린다", () => {
    const events = [event({ ts: "2026-10-22 02:58:00", agent: "REVIEW", event_type: "EXECUTE", details: { task: { id: "t-1", name: "선박 검수 화면" }, stage: "user_confirmation" } })];
    expect(selectWorldState(events, NOW)).toMatchObject({ mainSpot: "confirm", mainActivity: "waiting", activeSpecialist: null });
  });

  it("문서가 끝나면 메인이 출고대에서 커밋을 마무리한다", () => {
    expect(selectWorldState([event({ ts: "2026-10-23 02:59:00", agent: "DOCS", handoff_to: "MAIN" })], NOW)).toMatchObject({ mainSpot: "dock", activeSpecialist: null });
  });

  it("진행 중인 작업이 없고 확인할 리뷰가 있으면 확인 창구에서 기다린다", () => {
    expect(selectWorldState([], NOW, { waitingReviews: 1 })).toMatchObject({ mainSpot: "confirm", mainActivity: "waiting", live: false });
  });

  it("진행 중인 작업이 없고 시작 전 SPEC이 있으면 기획실에서 SPEC을 본다", () => {
    expect(selectWorldState([], NOW, { plannedSpecs: 2 })).toMatchObject({ mainSpot: "spec", mainActivity: "working", live: false });
  });

  it("같은 시간에 여러 작업이 진행 중이면 각 작업의 단계 인력이 모두 일한다", () => {
    const events = [
      event({ ts: "2026-10-23 02:50:00", agent: "TEST", handoff_to: "REVIEW" }),
      event({ ts: "2026-10-23 02:58:00", agent: "MAIN", handoff_to: "CODE", details: { task: { id: "t-2", name: "산책로 지도" } } }),
    ];
    expect(selectWorldState(events, NOW).activeSpecialists).toEqual(["CODE", "REVIEW"]);
  });

  it("할 일이 없으면 자기 자리에서 쉰다", () => {
    expect(selectWorldState([], NOW)).toMatchObject({ mainSpot: "desk", mainActivity: "resting", activeSpecialist: null });
  });
});

describe("taskTimelines", () => {
  it("작업마다 실제로 거친 단계를 시간 순서대로 모은다(재구현 반복 포함)", () => {
    const events = [
      event({ ts: "2026-10-23 01:00:00", agent: "MAIN", handoff_to: "CODE" }),
      event({ ts: "2026-10-23 01:10:00", agent: "CODE", handoff_to: "TEST" }),
      event({ ts: "2026-10-23 01:20:00", agent: "TEST", handoff_to: "REVIEW" }),
      event({ ts: "2026-10-23 01:30:00", agent: "REVIEW", handoff_to: "CODE" }),
      event({ ts: "2026-10-23 01:05:00", workspace_name: "park", agent: "MAIN", handoff_to: "CODE", details: { task: { id: "t-9", name: "산책로 지도" } } }),
    ];
    const [first, second] = taskTimelines(events);
    expect(first).toMatchObject({ name: "선박 검수 화면", workspace: "harbor" });
    expect(first.steps.map((step) => step.station)).toEqual(["code", "test", "review", "code"]);
    expect(second).toMatchObject({ name: "산책로 지도", workspace: "park" });
  });

  it("작업 식별자가 없는 옛 완료 이벤트는 같은 도메인에서 직전에 진행된 작업에 붙인다", () => {
    const legacy = { details: undefined };
    const events = [
      event({ ...legacy, ts: "2026-10-23 01:00:00", agent: "DOCS", handoff_to: "MAIN", message: "scroll-feed 완료 처리 인계" }),
      event({ ...legacy, ts: "2026-10-23 01:00:10", agent: "MAIN", event_type: "COMPLETED", message: "v3는 인덱스를 새로 읽는다" }),
    ];
    const timelines = taskTimelines(events);
    expect(timelines.map((timeline) => timeline.name)).toEqual(["scroll-feed"]);
    expect(timelines[0].steps).toHaveLength(2);
  });

  it("도메인을 지정하면 그 도메인의 작업만 모은다", () => {
    const events = [event({ ts: "2026-10-23 01:00:00", agent: "MAIN", handoff_to: "CODE" }), event({ ts: "2026-10-23 01:05:00", workspace_name: "park", agent: "MAIN", handoff_to: "CODE" })];
    expect(taskTimelines(events, "park").map((timeline) => timeline.workspace)).toEqual(["park"]);
  });
});

describe("weekBins", () => {
  it("이번 주 월요일부터 요일별 완료 수를 센다", () => {
    const now = new Date(2026, 9, 23, 12);
    const specs = [{ development_history: [
      { completed_at: new Date(2026, 9, 19, 10).toISOString() },
      { completed_at: new Date(2026, 9, 21, 10).toISOString() },
      { completed_at: new Date(2026, 9, 21, 15).toISOString() },
      { completed_at: new Date(2026, 9, 18, 10).toISOString() },
      { completed_at: null },
    ] }];
    expect(weekBins(specs, now)).toEqual([1, 0, 2, 0, 0, 0, 0]);
  });
});
