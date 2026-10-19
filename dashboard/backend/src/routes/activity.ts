import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { activityIngestSchema } from "../schemas/sync.js";
import { validateBody } from "../schemas/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireUser } from "../auth/requireUser.js";
import { ingestActivity, streamActivity } from "../services/activityService.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// Non-blocking ingest + polling read (no SSE/WebSocket).
// 핸들러는 asyncHandler로 감싸 에러가 프로세스를 죽이거나 요청을 행시키지 않고 500으로 끝나게 한다.
export function createActivityRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  // 공개 SaaS: 세션(웹) 또는 API 토큰(플러그인) 신원 강제. body/query userId는 신뢰하지 않는다.
  router.use(requireUser(db, sessionSecret));

  router.post(
    "/ingest",
    validateBody(activityIngestSchema),
    asyncHandler(async (req, res) => {
      await ingestActivity(db, { ...req.body, userId: req.userId });
      res.json({ ok: true });
    }),
  );

  router.get(
    "/stream",
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const workspace = req.query.workspace ? String(req.query.workspace) : undefined;
      const rawLimit = Number(req.query.limit ?? DEFAULT_LIMIT);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), MAX_LIMIT) : DEFAULT_LIMIT;
      const events = await streamActivity(db, userId, workspace, limit);
      res.json({ events });
    }),
  );

  return router;
}
