import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import type { AwsContextClient } from "../aws/contextClient.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { connectAwsContext, disconnectAwsContext, getAwsContextStatus, refreshAwsContext } from "../services/awsContextService.js";

const connectSchema = z.object({
  profile: z.string().regex(/^[A-Za-z0-9_-]+$/),
  region: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/),
});

export function createAwsContextRouter(db: DbClient, sessionSecret: string, client: AwsContextClient): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));
  router.get("/", async (req, res) => res.json(await getAwsContextStatus(db, req.userId!)));
  router.put("/", validateBody(connectSchema), async (req, res) => {
    try {
      await connectAwsContext(db, req.userId!, req.body.profile, req.body.region, client);
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: "AWS_IDENTITY_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });
  router.post("/refresh", async (req, res) => {
    try {
      res.json({ inventory: await refreshAwsContext(db, req.userId!, client) });
    } catch (error) {
      const code = (error as { code?: string }).code;
      res.status(code === "AWS_CONTEXT_NOT_CONNECTED" ? 409 : 502).json({ error: code ?? "AWS_INVENTORY_FAILED" });
    }
  });
  router.delete("/", async (req, res) => {
    await disconnectAwsContext(db, req.userId!);
    res.json({ ok: true });
  });
  return router;
}
