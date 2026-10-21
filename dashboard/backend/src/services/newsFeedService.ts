export type NewsLanguage = "ko" | "en";
export interface NewsSource { source: string; category: string; language: NewsLanguage; url: string }
export interface NewsItem { source: string; category: string; language: NewsLanguage; title: string; url: string; publishedAt: string; summary: string | null }

export const DEFAULT_NEWS_SOURCES: readonly NewsSource[] = [
  { source: "GeekNews", category: "기술 동향", language: "ko", url: "https://news.hada.io/rss/news" },
  { source: "AI타임스", category: "인공지능", language: "ko", url: "https://www.aitimes.com/rss/allArticle.xml" },
  { source: "MIT 테크놀로지 리뷰 코리아", category: "기술 분석", language: "ko", url: "https://www.technologyreview.kr/feed/" },
  { source: "OpenAI", category: "인공지능", language: "en", url: "https://openai.com/news/rss.xml" },
  { source: "Google AI", category: "인공지능", language: "en", url: "https://blog.google/technology/ai/rss/" },
  { source: "GitHub", category: "개발 도구", language: "en", url: "https://github.blog/changelog/feed/" },
];

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ").trim();
}

function element(block: string, names: string[]): string | null {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match?.[1]) return decodeXml(match[1]);
  }
  return null;
}

function linkOf(block: string): string | null {
  const text = element(block, ["link"]);
  if (text?.startsWith("http")) return text;
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  return href?.startsWith("http") ? href : null;
}

function parseFeed(xml: string, source: NewsSource): NewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.flatMap((block) => {
    const title = element(block, ["title"]);
    const url = linkOf(block);
    const dateText = element(block, ["pubDate", "published", "updated"]);
    if (!title || !url || !dateText) return [];
    const timestamp = Date.parse(dateText);
    if (Number.isNaN(timestamp)) return [];
    const summary = element(block, ["description", "summary", "content"]);
    return [{ source: source.source, category: source.category, language: source.language, title, url, publishedAt: new Date(timestamp).toISOString(), summary }];
  });
}

export function selectLocalizedNews(items: NewsItem[], language: NewsLanguage, limit: number): NewsItem[] {
  const diversify = (candidates: NewsItem[], count: number): NewsItem[] => {
    const bySource = new Map<string, NewsItem[]>();
    for (const item of candidates) bySource.set(item.source, [...(bySource.get(item.source) ?? []), item]);
    const selected: NewsItem[] = [];
    while (selected.length < count) {
      let added = false;
      for (const sourceItems of bySource.values()) {
        const item = sourceItems.shift();
        if (!item) continue;
        selected.push(item);
        added = true;
        if (selected.length === count) break;
      }
      if (!added) break;
    }
    return selected;
  };
  const localized = items.filter((item) => item.language === language);
  const global = items.filter((item) => item.language !== language);
  const localLimit = Math.min(localized.length, Math.ceil(limit * 0.6));
  const selected = [...diversify(localized, localLimit), ...diversify(global, limit - localLimit)];
  if (selected.length < limit) {
    const selectedUrls = new Set(selected.map((item) => item.url));
    selected.push(...items.filter((item) => !selectedUrls.has(item.url)).slice(0, limit - selected.length));
  }
  return selected;
}

export async function fetchNewsFeed(sources: readonly NewsSource[] = DEFAULT_NEWS_SOURCES, fetcher: typeof fetch = fetch): Promise<NewsItem[]> {
  const results = await Promise.allSettled(sources.map(async (source) => {
    const response = await fetcher(source.url, { signal: AbortSignal.timeout(5000), headers: { "user-agent": "Sugo-Console/1.0" } });
    if (!response.ok) throw new Error(`${source.source} RSS HTTP ${response.status}`);
    return parseFeed(await response.text(), source);
  }));
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
