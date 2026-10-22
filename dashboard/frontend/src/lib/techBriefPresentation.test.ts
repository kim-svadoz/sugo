import { describe, expect, it } from "vitest";
import { buildSevenDayFeed } from "./techBriefPresentation.js";

describe("Tech Brief 최근 7일", () => {
  it("7개 날짜를 만들고 선택한 날짜의 글을 10개씩 나눈다", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ source: "Tech", category: "개발", language: "ko" as const, title: `글 ${index}`, url: `https://example.com/${index}`, publishedAt: `2026-10-22T${String(index).padStart(2, "0")}:00:00.000Z`, summary: null }));
    const result = buildSevenDayFeed(items, "2026-10-22T12:00:00.000Z", "2026-10-22", 2);
    expect(result.days).toHaveLength(7);
    expect(result.items).toHaveLength(2);
    expect(result.pageCount).toBe(2);
    expect(result.days[0]).toMatchObject({ key: "2026-10-22", count: 12 });
  });
});
