import { Router } from "express";
import { DEFAULT_NEWS_SOURCES, fetchNewsFeed, selectLocalizedNews, type NewsItem, type NewsLanguage } from "../services/newsFeedService.js";

const CACHE_MS = 30 * 60 * 1000;
let cache: { items: NewsItem[]; fetchedAt: string; expiresAt: number } | null = null;

export function createNewsRouter(): Router {
  const router = Router();
  router.get("/", async (req, res, next) => {
    try {
      const language: NewsLanguage = req.query.locale === "ko" ? "ko" : "en";
      if (!cache || cache.expiresAt <= Date.now()) {
        const items = await fetchNewsFeed();
        cache = { items, fetchedAt: new Date().toISOString(), expiresAt: Date.now() + CACHE_MS };
      }
      res.json({
        items: selectLocalizedNews(cache.items, language, 20),
        fetchedAt: cache.fetchedAt,
        sourceCount: DEFAULT_NEWS_SOURCES.length,
        sources: DEFAULT_NEWS_SOURCES.map((source) => {
          const items = cache!.items.filter((item) => item.source === source.source);
          return {
            name: source.source,
            category: source.category,
            language: source.language,
            url: source.url,
            status: items.length > 0 ? "active" : "pending",
            lastPublishedAt: items[0]?.publishedAt ?? null,
          };
        }),
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
