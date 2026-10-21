import { describe, expect, it } from "vitest";
import { DEFAULT_NEWS_SOURCES, fetchNewsFeed, selectLocalizedNews } from "../src/services/newsFeedService.js";

describe("technology brief feed", () => {
  it("공식 RSS 항목을 최신순으로 정규화하고 HTML을 제거한다", async () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>New &amp; useful</title><link>https://example.com/news</link><pubDate>Tue, 20 Oct 2026 01:00:00 GMT</pubDate><description><![CDATA[<p>Details</p>]]></description></item></channel></rss>`;
    const feed = await fetchNewsFeed([{ source: "OpenAI", category: "AI", language: "en", url: "https://example.com/rss" }], async () => new Response(xml));
    expect(feed).toEqual([{ source: "OpenAI", category: "AI", language: "en", title: "New & useful", url: "https://example.com/news", publishedAt: "2026-10-20T01:00:00.000Z", summary: "Details" }]);
  });

  it("한 소스가 실패해도 다른 공식 피드는 표시한다", async () => {
    const feed = await fetchNewsFeed([
      { source: "Broken", category: "AI", language: "en", url: "https://bad.example/rss" },
      { source: "GitHub", category: "개발 도구", language: "en", url: "https://good.example/rss" },
    ], async (url) => String(url).includes("bad") ? new Response("no", { status: 503 }) : new Response(`<rss><channel><item><title>Agent update</title><link>https://github.blog/update</link><pubDate>Tue, 20 Oct 2026 02:00:00 GMT</pubDate></item></channel></rss>`));
    expect(feed).toHaveLength(1);
    expect(feed[0]?.source).toBe("GitHub");
  });

  it("국내외 공식 엔지니어링 블로그를 함께 구성한다", () => {
    expect(DEFAULT_NEWS_SOURCES.filter((source) => source.language === "ko").length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_NEWS_SOURCES.length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_NEWS_SOURCES.map((source) => source.source)).toEqual(expect.arrayContaining([
      "Meta Engineering", "Cloudflare", "Netflix TechBlog", "Kakao Tech", "NAVER D2", "Toss Tech",
    ]));
    const item = (source: string, language: "ko" | "en", hour: number) => ({ source, category: "AI", language, title: source, url: `https://example.com/${source}`, publishedAt: `2026-10-20T0${hour}:00:00.000Z`, summary: null });
    const selected = selectLocalizedNews([
      item("국문1", "ko", 6), item("국문2", "ko", 5), item("국문3", "ko", 4), item("영문1", "en", 3), item("영문2", "en", 2), item("영문3", "en", 1),
    ], "ko", 5);
    expect(selected.filter((news) => news.language === "ko")).toHaveLength(3);
    expect(selected.some((news) => news.language === "en")).toBe(true);
  });

  it("한 매체의 최신 글이 많아도 뉴스 목록을 독점하지 않는다", () => {
    const item = (source: string, hour: number) => ({ source, category: "AI", language: "ko" as const, title: `${source}-${hour}`, url: `https://example.com/${source}/${hour}`, publishedAt: `2026-10-20T${String(hour).padStart(2, "0")}:00:00.000Z`, summary: null });
    const selected = selectLocalizedNews([
      item("GeekNews", 9), item("GeekNews", 8), item("GeekNews", 7), item("GeekNews", 6),
      item("AI타임스", 5), item("MIT TR 코리아", 4),
    ], "ko", 5);
    expect(new Set(selected.map((news) => news.source)).size).toBe(3);
    expect(new Set(selected.slice(0, 3).map((news) => news.source)).size).toBe(3);
  });
});
