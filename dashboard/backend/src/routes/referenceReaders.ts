import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { loadReferenceReaders, matchReferenceReader, normalizeReferenceReaders, referenceReadersSchema, saveReferenceReaders } from "../services/referenceReaders.js";
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
    res.json({ readers: normalizeReferenceReaders(req.body.readers) });
  });
  router.post("/preview", validateBody(referenceReadersSchema), (req, res) => {
    const readers = normalizeReferenceReaders(req.body.readers);
    res.json({ readers, changed: readers.some((reader, index) => reader.urlPrefix !== req.body.readers[index]?.urlPrefix) });
  });
  router.post("/match", (req, res) => {
    const parsed = referenceReadersSchema.safeParse({ readers: req.body?.readers });
    if (!parsed.success || typeof req.body?.url !== "string") return res.status(400).json({ error: "invalid_request" });
    res.json({ match: matchReferenceReader(req.body.url, parsed.data.readers) ?? null });
  });
  return router;
}
