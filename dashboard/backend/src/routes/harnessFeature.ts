import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { loadHarnessFeatureState, updateHarnessFeature, type HarnessFeatureUpdater } from "../services/harnessFeatureService.js";

const schema = z.object({ enabled: z.boolean() }).strict();

export function createHarnessFeatureRouter(db: DbClient, secret: string, path: string, updater: HarnessFeatureUpdater = updateHarnessFeature): Router {
  const router = Router();
  router.use(requireUser(db, secret));
  router.get("/", async (_req, res) => res.json(await loadHarnessFeatureState(path)));
  router.put("/", validateBody(schema), async (req, res) => {
    try { res.json(await updater(req.body.enabled)); }
    catch (error) { res.status(500).json({ error: (error as any)?.code ?? "HARNESS_FEATURE_UPDATE_FAILED", message: error instanceof Error ? error.message : String(error) }); }
  });
  return router;
}
