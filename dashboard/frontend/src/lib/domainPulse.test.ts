import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { domainPulse, groupDomainsByPulse, stageHeadline } from "./domainPulse.js";
import { selectFloorLanes } from "./workFloor.js";

const NOW = Date.parse("2026-11-02T03:00:00Z");
let nextId = 1;
function event(partial: Partial<ActivityEvent> & { ts: string }): ActivityEvent {
  return { id: nextId++, workspace_name: "fashion", level: "info", agent: "MAIN", handoff_to: "CODE", event_type: "HANDOFF", message: "채널 규격", details: { task: { id: "t-1", name: "채널 규격" } }, ...partial };
}
const waitingEvent = (ts: string) => event({ ts, agent: "REVIEW", handoff_to: null, event_type: "EXECUTE", details: { task: { id: "t-1", name: "채널 규격" }, stage: "user_confirmation" } });
const lanesOf = (events: ActivityEvent[]) => selectFloorLanes(events, NOW);
const summary = { attentionCount: 0, attentionLabel: null, lastActivityAt: null };

describe("domainPulse", () => {
  it("사용자 확인을 기다리는 작업이 있으면 시간이 지나도 '확인 대기'로 맨 앞 묶음에 든다", () => {
    expect(domainPulse(summary, lanesOf([waitingEvent("2026-10-30 03:00:00")]))).toMatchObject({ tone: "waiting", label: "확인 대기" });
  });

  it("차단·확인 필요 작업이 있으면 진행 기록이 없어도 확인 필요로 본다", () => {
    expect(domainPulse({ ...summary, attentionCount: 2, attentionLabel: "차단 2건" }, [])).toMatchObject({ tone: "waiting", label: "차단 2건" });
  });

  it("방금 단계가 넘어간 작업은 그 단계 이름으로 진행 중이다", () => {
    expect(domainPulse(summary, lanesOf([event({ ts: "2026-11-02 02:58:00", handoff_to: "TEST" })]))).toMatchObject({ tone: "live", label: "테스트 중" });
  });

  it("오래 멈춘 작업은 멈춘 단계를, 끝난 작업은 커밋 완료를 조용함으로 보여 준다", () => {
    expect(domainPulse(summary, lanesOf([event({ ts: "2026-10-27 03:00:00", handoff_to: "REVIEW" })]))).toMatchObject({ tone: "quiet", label: "검토에서 멈춤" });
    expect(domainPulse(summary, lanesOf([event({ ts: "2026-10-27 03:00:00", event_type: "COMPLETED", handoff_to: null })]))).toMatchObject({ tone: "quiet", label: "커밋 완료" });
  });

  it("작업 기록이 없으면 마지막 활동 시각만 쓰고, 그것도 없으면 기록 없음이다", () => {
    expect(domainPulse({ ...summary, lastActivityAt: "2026-10-27T03:00:00Z" }, [])).toEqual({ tone: "quiet", label: "작업 대기", at: Date.parse("2026-10-27T03:00:00Z") });
    expect(domainPulse(summary, [])).toEqual({ tone: "quiet", label: "기록 없음", at: null });
  });

  it("과거 파이프라인 이벤트보다 최근 SPEC 변경 시각을 정렬에 사용한다", () => {
    expect(domainPulse(
      { ...summary, lastActivityAt: "2026-11-03T06:00:19Z" },
      lanesOf([event({ ts: "2026-10-21 01:58:22", event_type: "COMPLETED", handoff_to: null })]),
    )).toMatchObject({ tone: "quiet", at: Date.parse("2026-11-03T06:00:19Z") });
  });
});

describe("groupDomainsByPulse", () => {
  it("확인 필요 → 진행 중 → 조용함 순으로 묶고, 묶음 안은 최근 순이며 빈 묶음은 뺀다", () => {
    const groups = groupDomainsByPulse([
      { name: "old", pulse: { tone: "quiet" as const, label: "커밋 완료", at: 1 } },
      { name: "wait", pulse: { tone: "waiting" as const, label: "확인 대기", at: 5 } },
      { name: "new", pulse: { tone: "quiet" as const, label: "커밋 완료", at: 9 } },
      { name: "none", pulse: { tone: "quiet" as const, label: "기록 없음", at: null } },
    ]);
    expect(groups.map((group) => [group.title, group.items.map((item) => item.name)])).toEqual([
      ["내 확인 필요", ["wait"]],
      ["조용함", ["new", "old", "none"]],
    ]);
  });
});

describe("stageHeadline", () => {
  it("선택한 작업의 상태를 한 문장으로 말한다", () => {
    expect(stageHeadline(lanesOf([waitingEvent("2026-11-02 02:58:00")])[0])).toEqual({ tone: "waiting", text: "사용자 확인을 기다려요" });
    expect(stageHeadline(lanesOf([event({ ts: "2026-11-02 02:58:00" })])[0])).toEqual({ tone: "live", text: "구현 진행 중" });
    expect(stageHeadline(lanesOf([event({ ts: "2026-11-02 02:58:00", event_type: "COMPLETED", handoff_to: null })])[0])).toEqual({ tone: "done", text: "작업을 마쳤어요" });
    expect(stageHeadline(lanesOf([event({ ts: "2026-10-31 03:00:00", handoff_to: "TEST" })])[0])).toEqual({ tone: "paused", text: "테스트에서 멈췄어요" });
    expect(stageHeadline(lanesOf([event({ ts: "2026-10-20 03:00:00", event_type: "COMPLETED", handoff_to: null })])[0])).toEqual({ tone: "rest", text: "다음 작업을 기다려요" });
    expect(stageHeadline(undefined)).toEqual({ tone: "rest", text: "아직 작업 기록이 없어요" });
  });
});
