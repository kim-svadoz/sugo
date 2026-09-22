import { describe, expect, it } from "vitest";
import { sessionForTask, sessionsForProjects, summarizeSession } from "../src/work/sessionSummary.js";
import type { PlanSession } from "../src/types.js";

function session(overrides: Partial<PlanSession> = {}): PlanSession {
  return {
    id: "plan-1-aaa",
    state: "CODE_RUNNING",
    projectPath: "/p/alpha",
    startedAt: "2026-09-18T06:00:00.000Z",
    updatedAt: "2026-09-18T06:10:00.000Z",
    ...overrides,
  } as PlanSession;
}

describe("summarizeSession — 왜 멈췄는지만 남긴다", () => {
  it("종료되지 않은 세션은 resumable이다", () => {
    expect(summarizeSession(session({ state: "REVIEW_RUNNING" })).resumable).toBe(true);
  });

  it("DONE은 resumable이 아니다", () => {
    expect(summarizeSession(session({ state: "DONE" })).resumable).toBe(false);
  });

  it("취소는 상태가 아니라 cancelledAt이다 — state가 진행중이어도 resumable이 아니다", () => {
    // cancel 액션은 state를 그대로 두고 cancelledAt만 찍는다(planStateMachine.ts).
    // 상태값만 보면 취소된 세션이 영원히 "이어받을 수 있음"으로 남는다.
    const s = summarizeSession(session({ state: "CODE_RUNNING", cancelledAt: "2026-09-18T07:00:00.000Z" }));
    expect(s.resumable).toBe(false);
    expect(s.cancelledAt).toBe("2026-09-18T07:00:00.000Z");
  });

  it("취소되지 않았으면 cancelledAt 필드를 싣지 않는다", () => {
    expect(summarizeSession(session())).not.toHaveProperty("cancelledAt");
  });

  it("updatedAt을 실행 머신 시간대로 포맷해 함께 싣는다", () => {
    const s = summarizeSession(session({ updatedAt: "2026-09-18T06:31:51.270Z" }));
    // 시간대를 하드코딩하지 않으므로 값 자체는 환경에 따라 다르다 — 형태와 원본 보존만 검증한다.
    expect(s.updatedAtLocal).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(s.updatedAt).toBe("2026-09-18T06:31:51.270Z");
  });

  it("updatedAt이 없거나 파싱 불가면 updatedAtLocal을 싣지 않는다", () => {
    expect(summarizeSession(session({ updatedAt: undefined }))).not.toHaveProperty("updatedAtLocal");
    expect(summarizeSession(session({ updatedAt: "안녕하세요" }))).not.toHaveProperty("updatedAtLocal");
  });

  it("테스트 실패를 blocker로 싣는다", () => {
    const s = summarizeSession(
      session({ data: { chainInfo: { testEvidence: { failed: 2, total: 9 } } } } as Partial<PlanSession>),
    );
    expect(s.blockers).toContain("테스트 실패 2/9");
  });

  it("analyze·review 미통과와 재시도 횟수를 함께 싣는다", () => {
    const s = summarizeSession(
      session({
        data: { chainInfo: { analyzePassed: false, reviewPassed: false, autoLoopRetryCount: 3 } },
      } as Partial<PlanSession>),
    );
    expect(s.blockers).toEqual(["analyze 미통과", "review 미통과", "review 재시도 3회"]);
  });

  it("통과한 항목은 blocker에 넣지 않는다", () => {
    const s = summarizeSession(
      session({
        data: { chainInfo: { analyzePassed: true, reviewPassed: true, autoLoopRetryCount: 0, testEvidence: { failed: 0, total: 9 } } },
      } as Partial<PlanSession>),
    );
    expect(s.blockers).toEqual([]);
  });

  it("chainInfo가 없어도 깨지지 않는다", () => {
    const s = summarizeSession(session());
    expect(s.blockers).toEqual([]);
    expect(s.changedFileCount).toBeUndefined();
  });

  it("changedFiles가 있으면 개수만 싣는다(목록은 버린다)", () => {
    const s = summarizeSession(
      session({ data: { chainInfo: { changedFiles: ["a.java", "b.java"] } } } as Partial<PlanSession>),
    );
    expect(s.changedFileCount).toBe(2);
    expect(JSON.stringify(s)).not.toContain("a.java");
  });
});

describe("sessionsForProjects — 워크스페이스 소속 판정", () => {
  const sessions = [
    session({ id: "s-alpha", projectPath: "/p/alpha", updatedAt: "2026-09-18T01:00:00.000Z" }),
    session({ id: "s-beta", projectPath: "/p/beta", updatedAt: "2026-09-18T03:00:00.000Z" }),
    session({ id: "s-other", projectPath: "/p/outside", updatedAt: "2026-09-18T05:00:00.000Z" }),
  ];

  it("소속 프로젝트의 세션만 고른다", () => {
    const result = sessionsForProjects(sessions, ["/p/alpha", "/p/beta"]);
    expect(result.map((s) => s.sessionId)).toEqual(["s-beta", "s-alpha"]);
  });

  it("최신 갱신순으로 정렬한다", () => {
    const result = sessionsForProjects(sessions, ["/p/alpha", "/p/beta", "/p/outside"]);
    expect(result.map((s) => s.sessionId)).toEqual(["s-other", "s-beta", "s-alpha"]);
  });

  it("소속 프로젝트가 없으면 빈 배열", () => {
    expect(sessionsForProjects(sessions, [])).toEqual([]);
  });

  it("경로 부분일치로 넘어가지 않는다 — 정확히 일치해야 한다", () => {
    // "/p/alpha-legacy"가 "/p/alpha"로 시작한다고 같은 프로젝트로 묶으면 안 된다.
    const extra = [...sessions, session({ id: "s-legacy", projectPath: "/p/alpha-legacy" })];
    const result = sessionsForProjects(extra, ["/p/alpha"]);
    expect(result.map((s) => s.sessionId)).toEqual(["s-alpha"]);
  });
});

describe("sessionForTask — task ↔ session 연결", () => {
  const sessions = [
    session({ id: "s-old", updatedAt: "2026-09-18T01:00:00.000Z", data: { hulkTaskId: "task-1" } } as Partial<PlanSession>),
    session({ id: "s-new", updatedAt: "2026-09-18T05:00:00.000Z", data: { hulkTaskId: "task-1" } } as Partial<PlanSession>),
    session({ id: "s-other", updatedAt: "2026-09-18T09:00:00.000Z", data: { hulkTaskId: "task-2" } } as Partial<PlanSession>),
  ];

  it("해당 태스크의 세션 중 가장 최근 것을 돌려준다", () => {
    expect(sessionForTask(sessions, "task-1")?.sessionId).toBe("s-new");
  });

  it("연결된 세션이 없으면 undefined", () => {
    expect(sessionForTask(sessions, "task-없음")).toBeUndefined();
  });

  it("다른 태스크의 세션을 잘못 집어오지 않는다", () => {
    expect(sessionForTask(sessions, "task-2")?.sessionId).toBe("s-other");
  });
});
