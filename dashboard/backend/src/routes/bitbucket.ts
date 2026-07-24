import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import type { VerifyJwt } from "../auth/jwt.js";
import { requireAuth } from "../auth/requireAuth.js";
import { validateBody } from "../schemas/validate.js";
import {
  deleteBitbucketToken,
  getBitbucketTokenStatus,
  setBitbucketToken,
} from "../services/bitbucketTokenService.js";

const putSchema = z.object({
  token: z.string().min(1),
  baseUrl: z.string().optional(),
});

// §3.5: AUTH-gated (requireAuth). GET never returns the token, only hint/status.
export function createBitbucketRouter(db: DbClient, verifyJwt: VerifyJwt, secretEncKey: string): Router {
  const router = Router();
  router.use(requireAuth(verifyJwt));

  router.get("/", async (req, res) => {
    const status = await getBitbucketTokenStatus(db, req.userId!);
    res.json(status);
  });

  router.put("/", validateBody(putSchema), async (req, res) => {
    try {
      await setBitbucketToken(db, req.userId!, req.body.token, req.body.baseUrl, secretEncKey);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "encryption_failed" });
    }
  });

  router.delete("/", async (req, res) => {
    await deleteBitbucketToken(db, req.userId!);
    res.json({ ok: true });
  });

  return router;
}
