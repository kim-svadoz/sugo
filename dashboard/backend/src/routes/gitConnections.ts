import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { gitProviderCatalog, gitProviderIds } from "../git/provider.js";
import { deleteGitConnection, listGitConnections, setGitConnection } from "../services/gitConnectionService.js";

const providerSchema = z.enum(gitProviderIds);
const connectionSchema = z.object({
  provider: providerSchema,
  token: z.string().optional(),
  baseUrl: z.string().url().optional(),
  profile: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
  repositories: z.array(z.string().min(1)).min(1).optional(),
}).superRefine((value, context) => {
  if (value.provider !== "aws_codecommit" && !value.token) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["token"], message: "token is required" });
  }
});

export function createGitConnectionsRouter(db: DbClient, sessionSecret: string, secretEncKey: string): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));

  router.get("/", async (req, res) => {
    res.json({ providers: gitProviderCatalog, connections: await listGitConnections(db, req.userId!) });
  });

  router.put("/", validateBody(connectionSchema), async (req, res) => {
    const descriptor = gitProviderCatalog.find((item) => item.id === req.body.provider)!;
    if (descriptor.status !== "available") {
      res.status(409).json({ error: "PROVIDER_NOT_AVAILABLE" });
      return;
    }
    if (descriptor.selfHosted && !req.body.baseUrl && !descriptor.defaultBaseUrl) {
      res.status(400).json({ error: "BASE_URL_REQUIRED" });
      return;
    }
    await setGitConnection(db, req.userId!, req.body.provider, req.body.token ?? "", req.body.baseUrl, req.body.profile, req.body.repositories, secretEncKey);
    res.json({ ok: true });
  });

  router.delete("/:provider", async (req, res) => {
    const parsed = providerSchema.safeParse(req.params.provider);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_PROVIDER" });
      return;
    }
    await deleteGitConnection(db, req.userId!, parsed.data);
    res.json({ ok: true });
  });
  return router;
}
