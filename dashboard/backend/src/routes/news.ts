import { Router } from "express";
import { fetchNewsFeed, selectLocalizedNews, type NewsItem, type NewsLanguage } from "../services/newsFeedService.js";

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
        sourceCount: new Set(cache.items.map((item) => item.source)).size,
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
