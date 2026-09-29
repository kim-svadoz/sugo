import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import type { AwsContextClient } from "../aws/contextClient.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { connectAwsContext, disconnectAwsContext, getAwsContextStatus, refreshAwsContext, setActiveAwsContext } from "../services/awsContextService.js";

const connectSchema = z.object({
  name: z.string().trim().min(1).max(64),
  profile: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  region: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/),
});
const accountSchema = z.object({ name: z.string().trim().min(1).max(64) });

export function createAwsContextRouter(db: DbClient, sessionSecret: string, client: AwsContextClient): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));
  router.get("/", async (req, res) => res.json(await getAwsContextStatus(db, req.userId!)));
  router.put("/", validateBody(connectSchema), async (req, res) => {
    try {
      await connectAwsContext(db, req.userId!, req.body.name, req.body.profile, req.body.region, client);
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: "AWS_IDENTITY_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });
  router.post("/active", validateBody(accountSchema), async (req, res) => {
    try { await setActiveAwsContext(db, req.userId!, req.body.name); res.json({ ok: true }); }
    catch (error) { res.status(404).json({ error: (error as { code?: string }).code ?? "AWS_CONTEXT_NOT_FOUND" }); }
  });
  router.post("/refresh", async (req, res) => {
    try {
      res.json({ inventory: await refreshAwsContext(db, req.userId!, client) });
    } catch (error) {
      const code = (error as { code?: string }).code;
      res.status(code === "AWS_CONTEXT_NOT_CONNECTED" ? 409 : 502).json({ error: code ?? "AWS_INVENTORY_FAILED" });
    }
  });
  router.delete("/:name", async (req, res) => {
    await disconnectAwsContext(db, req.userId!, req.params.name);
    res.json({ ok: true });
  });
  return router;
}
