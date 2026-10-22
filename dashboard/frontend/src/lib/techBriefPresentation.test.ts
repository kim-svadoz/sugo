import { describe, expect, it } from "vitest";
import { buildSevenDayFeed, filterNewsByRegion } from "./techBriefPresentation.js";

describe("Tech Brief 최근 7일", () => {
  it("7개 날짜를 만들고 선택한 날짜의 글을 10개씩 나눈다", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ source: "Tech", category: "개발", language: "ko" as const, title: `글 ${index}`, url: `https://example.com/${index}`, publishedAt: `2026-10-22T${String(index).padStart(2, "0")}:00:00.000Z`, summary: null }));
    const result = buildSevenDayFeed(items, "2026-10-22T12:00:00.000Z", "2026-10-22", 2);
    expect(result.days).toHaveLength(7);
    expect(result.items).toHaveLength(2);
    expect(result.pageCount).toBe(2);
    expect(result.days.at(-1)).toMatchObject({ key: "2026-10-22", count: 12, isToday: true });
    expect(result.days[0]?.key).toBe("2026-10-16");
  });

  it("국내와 국외 피드를 언어 기준으로 분리한다", () => {
    const items = [
      { source: "국내", category: "개발", language: "ko" as const, title: "한국 글", url: "https://example.com/ko", publishedAt: "2026-10-22T00:00:00.000Z", summary: null },
      { source: "Global", category: "Engineering", language: "en" as const, title: "English", url: "https://example.com/en", publishedAt: "2026-10-22T00:00:00.000Z", summary: null },
    ];
    expect(filterNewsByRegion(items, "domestic").map((item) => item.language)).toEqual(["ko"]);
    expect(filterNewsByRegion(items, "global").map((item) => item.language)).toEqual(["en"]);
  });
});
