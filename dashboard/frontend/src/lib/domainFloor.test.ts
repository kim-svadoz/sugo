import { describe, expect, it } from "vitest";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { selectDomainLanes } from "./domainFloor.js";
import { domainPulse } from "./domainPulse.js";

const now = Date.parse("2026-11-24T03:00:00Z");
const draft: ScheduledSpec = {
  id: "spec-manual-1", workspace_name: "shop", title: "결제 개선", status: "pending",
  due_date: null, project_path: "/work/shop", spec_path: null, has_run: false,
};
const ready = { ...draft, spec_path: "/example/spec.md" };
const started = { ...ready, has_run: true, status: "in_progress", task_ids: ["task-a", "task-b"], focus_task_id: "task-a" };
const implementation: ActivityEvent = {
  id: 1, workspace_name: "shop", ts: "2026-11-24T02:59:00Z", level: "info",
  agent: "MAIN", handoff_to: "CODE", event_type: "HANDOFF", message: "구현 시작",
  details: { task: { id: "task-b", name: "내부 작업명" } },
};

describe("도메인 SPEC 작업 레일", () => {
  it("초안은 건너뛰고 정식 SPEC은 작업 지시를 기다리는 레일에 표시한다", () => {
    expect(selectDomainLanes([], [draft], "shop", now)).toEqual([]);
    const lanes = selectDomainLanes([], [ready], "shop", now);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({ spec: ready, preparation: "ready", state: { station: "order", live: false, passed: [] } });
    expect(domainPulse({ attentionCount: 0, attentionLabel: null, lastActivityAt: null }, lanes).label).toBe("스펙 작성 완료");
  });

  it("RUN과 활동 로그가 따로 도착해도 같은 도메인·SPEC 키를 유지한다", () => {
    const [prepared] = selectDomainLanes([], [ready], "shop", now);
    const [starting] = selectDomainLanes([], [started], "shop", now);
    const [running] = selectDomainLanes([implementation], [started], "shop", now);
    expect(starting).toMatchObject({ key: prepared.key, preparation: "starting", state: { live: false } });
    expect(running).toMatchObject({ key: prepared.key, activityKey: "shop:task-b", spec: started, state: { station: "code", live: true } });
    expect(running.preparation).toBeUndefined();
  });

  it("다른 도메인의 같은 작업 ID를 연결하지 않고 진행 중인 작업을 우선한다", () => {
    const foreign = { ...started, workspace_name: "another" };
    const lanes = selectDomainLanes([implementation], [foreign, ready], "shop", now);
    expect(lanes.map((lane) => [lane.key, lane.preparation])).toEqual([
      ["shop:task-b", undefined],
      ["schedule:shop:spec-manual-1", "ready"],
    ]);
  });

  it("다른 작업이 진행 중이어도 기존 실행 기록을 보존한다", () => {
    const earlier = { ...implementation, ts: "2026-11-24T02:30:00Z" };
    const other = { ...implementation, id: 2, details: { task: { id: "another-task" } } };
    const lanes = selectDomainLanes([earlier, other], [started], "shop", now);
    expect(lanes[0].key).toBe("shop:another-task");
    expect(lanes[1]).toMatchObject({ key: "schedule:shop:spec-manual-1", state: { activity: "paused", station: "code" } });
    expect(lanes[1].preparation).toBeUndefined();
  });
});
