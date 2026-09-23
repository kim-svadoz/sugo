import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { issueSession } from "../auth/session.js";
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

  router.get("/", async (_req, res, next) => {
    try {
      if (!local.enabled) return res.status(404).json({ error: "local_dev_disabled" });
      if (!sessionSecret) return res.status(503).json({ error: "session_secret_required" });

      await syncUser(db, { userId: local.userId, displayName: local.displayName });
      const session = await issueSession(local.userId, sessionSecret);
      res.redirect(`${frontendUrl}/auth/callback#session=${encodeURIComponent(session)}`);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
