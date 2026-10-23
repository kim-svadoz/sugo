import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { SIDEBAR_DESTINATIONS } from "./sidebarNavigation.js";
import { selectWorkScene } from "./workScene.js";

const NOW = Date.parse("2026-10-23T03:00:00Z");
function event(partial: Partial<ActivityEvent> & { ts: string }): ActivityEvent {
  return { id: 1, workspace_name: "demo", level: "info", agent: null, handoff_to: null, event_type: "EXECUTE", message: "로그인 제한 · 구현 시작", ...partial };
}

describe("selectWorkScene", () => {
  it("이벤트가 없으면 화면마다 성격에 맞는 서로 다른 반복 동작을 고른다", () => {
    const poses = ["/home", ...SIDEBAR_DESTINATIONS.map((item) => item.to)].map((path) => selectWorkScene(path, [], NOW));
    expect(poses.every((scene) => !scene.live)).toBe(true);
    expect(new Set(poses.map((scene) => scene.pose)).size).toBe(poses.length);
  });

  it.each([
    ["CODE", "building"],
    ["TEST", "inspecting"],
    ["REVIEW", "reviewing"],
    ["DOCS", "writing"],
  ])("파이프라인이 %s 단계로 넘어가면 그 단계 동작을 모든 화면에서 보여준다", (agent, pose) => {
    const events = [event({ ts: "2026-10-23 02:55:00.000", agent: "MAIN", handoff_to: agent, event_type: "HANDOFF" })];
    for (const path of ["/home", "/schedule", "/skills"]) {
      const scene = selectWorkScene(path, events, NOW);
      expect(scene).toMatchObject({ pose, live: true, detail: "로그인 제한 · 구현 시작" });
    }
  });

  it("인계 없이 실행 중인 이벤트는 실행한 에이전트의 동작을 쓴다", () => {
    expect(selectWorkScene("/weekly", [event({ ts: "2026-10-23 02:59:00", agent: "TEST" })], NOW).pose).toBe("inspecting");
  });

  it("가장 최근 이벤트만 기준으로 삼는다", () => {
    const events = [
      event({ id: 1, ts: "2026-10-23 02:40:00", agent: "CODE", handoff_to: "TEST", event_type: "HANDOFF" }),
      event({ id: 2, ts: "2026-10-23 02:50:00", agent: "TEST", handoff_to: "REVIEW", event_type: "HANDOFF" }),
    ];
    expect(selectWorkScene("/home", [...events].reverse(), NOW).pose).toBe("reviewing");
    expect(selectWorkScene("/home", events, NOW).pose).toBe("reviewing");
  });

  it("완료 직후에는 축하 동작을 보이고, 잠시 뒤 화면 기본 동작으로 돌아간다", () => {
    const done = [event({ ts: "2026-10-23 02:58:30", agent: "MAIN", event_type: "COMPLETED", message: "로그인 제한 완료" })];
    expect(selectWorkScene("/home", done, NOW)).toMatchObject({ pose: "celebrating", live: true });
    expect(selectWorkScene("/home", done, NOW + 10 * 60_000).live).toBe(false);
  });

  it("오래된 이벤트는 진행 중으로 보지 않는다", () => {
    const stale = [event({ ts: "2026-10-23 02:30:00", agent: "CODE", handoff_to: "TEST", event_type: "HANDOFF" })];
    expect(selectWorkScene("/home", stale, NOW).live).toBe(false);
  });

  it("시간대 표기가 없는 서버 시각을 UTC로 읽는다", () => {
    const utc = [event({ ts: "2026-10-23 02:59:00", agent: "CODE", event_type: "EXECUTE" })];
    expect(selectWorkScene("/home", utc, NOW).live).toBe(true);
    expect(selectWorkScene("/home", utc, NOW + 9 * 60 * 60_000).live).toBe(false);
  });

  it("SYSTEM 이벤트와 알 수 없는 에이전트는 진행 동작으로 바꾸지 않는다", () => {
    expect(selectWorkScene("/home", [event({ ts: "2026-10-23 02:59:00", agent: "MAIN", event_type: "SYSTEM" })], NOW).live).toBe(false);
    expect(selectWorkScene("/home", [event({ ts: "2026-10-23 02:59:00", agent: "OTHER" })], NOW).live).toBe(false);
  });
});
