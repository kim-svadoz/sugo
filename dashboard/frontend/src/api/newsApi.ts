import { apiJson } from "./client.js";

export interface NewsItem {
  source: string;
  category: string;
  language: "ko" | "en";
  title: string;
  url: string;
  publishedAt: string;
  summary: string | null;
}

export interface NewsFeed {
  items: NewsItem[];
  fetchedAt: string;
  sourceCount: number;
  sources: Array<{
    name: string;
    category: string;
    language: "ko" | "en";
    url: string;
    status: "active" | "pending";
    lastPublishedAt: string | null;
  }>;
}

export async function getNewsFeed(locale = "ko"): Promise<NewsFeed> {
  return apiJson<NewsFeed>(`/api/news?locale=${encodeURIComponent(locale)}`);
}
