import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { integrationFeaturesSchema, loadIntegrationFeatures, saveIntegrationFeatures } from "../services/integrationFeatures.js";

export function createIntegrationFeaturesRouter(db: DbClient, secret: string, path: string): Router {
  const router = Router();
  router.use(requireUser(db, secret));
  router.get("/", async (req, res) => res.json(await loadIntegrationFeatures(path, db, req.userId!)));
  router.put("/", validateBody(integrationFeaturesSchema), async (req, res) => {
    await saveIntegrationFeatures(path, req.body);
    res.json(req.body);
  });
  return router;
}
