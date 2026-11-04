import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { loadReferenceReaders, referenceReadersSchema, saveReferenceReaders } from "../services/referenceReaders.js";
import { inspectWikiMcpStatus } from "../services/wikiSetupStatus.js";

export function createReferenceReadersRouter(db: DbClient, secret: string, settingsPath: string): Router {
  const router = Router();
  router.use(requireUser(db, secret));
  router.get("/", async (_req, res) => {
    const [readers, setup] = await Promise.all([loadReferenceReaders(settingsPath), inspectWikiMcpStatus()]);
    res.json({ readers, setup });
  });
  router.put("/", validateBody(referenceReadersSchema), async (req, res) => {
    await saveReferenceReaders(settingsPath, req.body.readers);
    res.json(req.body);
  });
  return router;
}
