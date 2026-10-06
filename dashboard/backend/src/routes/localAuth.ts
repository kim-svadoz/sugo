import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { issueSession, requireSession } from "../auth/session.js";
import { syncUser } from "../services/syncService.js";

export interface LocalAuthConfig {
  enabled: boolean;
  userId: string;
  displayName: string;
}

/**
 * 개인용 localhost 개발 로그인. LOCAL_DEV_MODE에서만 라우터가 mount되며,
 * production OAuth 경로와 인증 정책은 그대로 유지한다.
 */
export function createLocalAuthRouter(
  db: DbClient,
  sessionSecret: string,
  frontendUrl: string,
  local: LocalAuthConfig,
): Router {
  const router = Router();

  // Refresh an already authenticated local browser without dropping its modal/draft.
  // API tokens cannot be converted into an approval session.
  router.get("/session", requireSession(sessionSecret), async (req, res, next) => {
    try {
      if (!local.enabled) return res.status(404).json({ error: "local_dev_disabled" });
      if (req.userId !== local.userId) return res.status(403).json({ error: "LOCAL_USER_MISMATCH", message: "현재 로컬 사용자와 로그인한 사용자가 다릅니다." });
      const ttl = 7 * 24 * 3600;
      const session = await issueSession(local.userId, sessionSecret, ttl, "local");
      res.setHeader("Cache-Control", "no-store");
      res.json({ userId: local.userId, authSource: "local", session, expiresAt: Date.now() + ttl * 1000 });
    } catch (error) { next(error); }
  });

  router.get("/", async (_req, res, next) => {
    try {
      if (!local.enabled) return res.status(404).json({ error: "local_dev_disabled" });
      if (!sessionSecret) return res.status(503).json({ error: "session_secret_required" });

      await syncUser(db, { userId: local.userId, displayName: local.displayName });
      const session = await issueSession(local.userId, sessionSecret, 7 * 24 * 3600, "local");
      res.redirect(`${frontendUrl}/auth/callback#session=${encodeURIComponent(session)}`);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
