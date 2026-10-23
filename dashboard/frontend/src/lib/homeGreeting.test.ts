import { describe, expect, it } from "vitest";
import { dailyGreeting, greetingWindowCount } from "./homeGreeting.js";

function at(hour: number, minute = 0): Date { return new Date(2026, 9, 22, hour, minute); }

describe("dailyGreeting", () => {
  it("업무 시간 08:00~19:00을 일곱 구간으로 나누고 경계마다 다른 맥락을 준다", () => {
    const samples = [at(8), at(9, 30), at(11), at(13), at(15), at(17), at(18, 30)].map(dailyGreeting);
    expect(new Set(samples).size).toBe(7);
  });

  it("모든 인사말이 수사적 표현 없이 사실과 다음 행동만 말한다", () => {
    const samples = Array.from({ length: 24 * 2 * 2 }, (_, index) => dailyGreeting(new Date(2026, 9, 22 + (index % 2), Math.floor(index / 4), (index % 4 < 2 ? 0 : 30))));
    for (const message of new Set(samples)) {
      expect(message).not.toMatch(/선명|무르익|놓아주|형태를 갖췄|하루를 만듭니다|흐름을 정돈/);
    }
  });

  it("업무 외 시간에도 다섯 구간을 제공한다", () => {
    expect(greetingWindowCount).toBe(12);
    const samples = [at(0), at(3), at(6), at(19), at(22)].map(dailyGreeting);
    expect(new Set(samples).size).toBe(5);
  });
});
