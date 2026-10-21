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
}

export async function getNewsFeed(locale = "ko"): Promise<NewsFeed> {
  return apiJson<NewsFeed>(`/api/news?locale=${encodeURIComponent(locale)}`);
}
