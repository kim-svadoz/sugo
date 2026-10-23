import { describe, expect, it } from "vitest";
import { latestWeeklySlot, weeklyRunDecision } from "../src/services/weeklyScheduleService.js";

const schedule = { enabled: true, weekday: 5, hour: 17, minute: 0 };
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe("weekly schedule", () => {
  it("가장 최근의 예약 시점을 현지 시각으로 찾는다", () => {
    expect(latestWeeklySlot(local(2026, 10, 23, 17, 0), schedule)).toEqual(local(2026, 10, 23, 17, 0));
    expect(latestWeeklySlot(local(2026, 10, 23, 16, 59), schedule)).toEqual(local(2026, 10, 16, 17, 0));
    expect(latestWeeklySlot(local(2026, 10, 26, 9, 0), schedule)).toEqual(local(2026, 10, 23, 17, 0));
    expect(latestWeeklySlot(local(2026, 10, 25, 8, 0), { ...schedule, weekday: 0, hour: 8 })).toEqual(local(2026, 10, 25, 8, 0));
  });

  it("처리 기록이 없으면 실행하지 않고 현재 시점을 기준으로 기록한다", () => {
    expect(weeklyRunDecision(local(2026, 10, 24, 10, 0), schedule, null)).toEqual({ run: false, record: local(2026, 10, 23, 17, 0).toISOString() });
  });

  it("마지막 처리 이후 새 예약 시점이 지났으면 한 번 실행한다", () => {
    const handled = local(2026, 10, 16, 17, 0).toISOString();
    expect(weeklyRunDecision(local(2026, 10, 23, 17, 1), schedule, handled)).toEqual({ run: true, record: local(2026, 10, 23, 17, 0).toISOString() });
    expect(weeklyRunDecision(local(2026, 10, 23, 16, 0), schedule, handled)).toEqual({ run: false, record: null });
  });

  it("Console이 꺼져 있다 켜지면 밀린 예약을 한 번만 실행한다", () => {
    const handled = local(2026, 10, 9, 17, 0).toISOString();
    expect(weeklyRunDecision(local(2026, 10, 26, 9, 0), schedule, handled)).toEqual({ run: true, record: local(2026, 10, 23, 17, 0).toISOString() });
  });

  it("예약을 끄면 실행하지 않는다", () => {
    expect(weeklyRunDecision(local(2026, 10, 23, 18, 0), { ...schedule, enabled: false }, local(2026, 10, 16, 17, 0).toISOString())).toEqual({ run: false, record: null });
  });
});
