import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { activityIngestSchema } from "../schemas/sync.js";
import { validateBody } from "../schemas/validate.js";
import { ingestActivity, streamActivity } from "../services/activityService.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// §3.2/§4: PUBLIC, non-blocking ingest + polling read (no SSE/WebSocket).
export function createActivityRouter(db: DbClient): Router {
  const router = Router();

  router.post("/ingest", validateBody(activityIngestSchema), async (req, res) => {
    await ingestActivity(db, req.body);
    res.json({ ok: true });
  });

  router.get("/stream", async (req, res) => {
    const userId = String(req.query.userId ?? "");
    if (!userId) return res.status(400).json({ error: "userId required" });
    const workspace = req.query.workspace ? String(req.query.workspace) : undefined;
    const rawLimit = Number(req.query.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), MAX_LIMIT) : DEFAULT_LIMIT;
    const events = await streamActivity(db, userId, workspace, limit);
    res.json({ events });
  });

  return router;
}
