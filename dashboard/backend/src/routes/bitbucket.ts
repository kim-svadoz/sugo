import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
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

// 인증 필요. 세션(웹) 또는 API 토큰(플러그인) 둘 다 수용. GET은 토큰 미반환(hint/status만).
export function createBitbucketRouter(db: DbClient, sessionSecret: string, secretEncKey: string): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));

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
