import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { resolveRefs } from "../services/prService.js";
import { getDecryptedBitbucketToken } from "../services/bitbucketTokenService.js";
import type { BitbucketClient } from "../bitbucket/client.js";

const scopeEnum = z.enum(["task", "run", "spec"]);

const createSchema = z.object({
  workspace: z.string().min(1),
  nodeId: z.string().min(1),
  scope: scopeEnum,
  title: z.string().optional(),
  description: z.string().optional(),
  targetBranch: z.string().optional(),
});

const existingSchema = z.object({
  workspace: z.string().min(1),
  nodeId: z.string().min(1),
  scope: scopeEnum,
  targetBranch: z.string().optional(),
});

// §3.4/§6: AUTH-gated. Error codes: NO_TOKEN, NO_REFS, MULTI_BRANCH, BRANCH_NOT_PUSHED.
export function createPrRouter(
  db: DbClient,
  sessionSecret: string,
  secretEncKey: string,
  bitbucketClient: BitbucketClient
): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));

  router.post("/existing", validateBody(existingSchema), async (req, res) => {
    const { workspace, nodeId, scope } = req.body;
    const refsResult = await resolveRefs(db, req.userId!, workspace, nodeId, scope);
    if (!refsResult.ok) {
      res.json({ exists: false, error: refsResult.error });
      return;
    }
    const token = await getDecryptedBitbucketToken(db, req.userId!, secretEncKey);
    if (!token) {
      res.json({ exists: false, error: "NO_TOKEN" });
      return;
    }
    try {
      const pr = await bitbucketClient.findOpenPr(
        { baseUrl: token.baseUrl ?? refsResult.ref.baseUrl, projectKey: refsResult.ref.projectKey, repoSlug: refsResult.ref.repoSlug, token: token.token },
        refsResult.ref.sourceBranch
      );
      res.json({ exists: Boolean(pr), pr: pr ?? undefined });
    } catch {
      res.json({ exists: false, error: "LOOKUP_FAILED" });
    }
  });

  router.post("/create", validateBody(createSchema), async (req, res) => {
    const { workspace, nodeId, scope, title, description, targetBranch } = req.body;
    const refsResult = await resolveRefs(db, req.userId!, workspace, nodeId, scope);
    if (!refsResult.ok) {
      res.status(409).json({ error: refsResult.error });
      return;
    }
    const token = await getDecryptedBitbucketToken(db, req.userId!, secretEncKey);
    if (!token) {
      res.status(409).json({ error: "NO_TOKEN" });
      return;
    }
    const repo = {
      baseUrl: token.baseUrl ?? refsResult.ref.baseUrl,
      projectKey: refsResult.ref.projectKey,
      repoSlug: refsResult.ref.repoSlug,
      token: token.token,
    };
    const fromBranch = refsResult.ref.sourceBranch;
    const toBranch = targetBranch ?? refsResult.ref.targetBranch;

    try {
      const branchExists = await bitbucketClient.remoteBranchExists(repo, fromBranch);
      if (!branchExists) {
        res.status(409).json({ error: "BRANCH_NOT_PUSHED" });
        return;
      }
      const existing = await bitbucketClient.findOpenPr(repo, fromBranch);
      if (existing) {
        res.json({ pr: existing, existed: true });
        return;
      }
      const pr = await bitbucketClient.createPullRequest(repo, {
        title: title ?? `${nodeId}: ${fromBranch} -> ${toBranch}`,
        description,
        fromBranch,
        toBranch,
      });
      res.json({ pr, existed: false });
    } catch {
      res.status(502).json({ error: "BITBUCKET_REQUEST_FAILED" });
    }
  });

  return router;
}
