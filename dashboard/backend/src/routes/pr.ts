import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { resolveRefs } from "../services/prService.js";
import { getDecryptedGitConnection } from "../services/gitConnectionService.js";
import { detectGitProvider, repositoryFor } from "../git/provider.js";
import type { GitProviderClients } from "../git/clients.js";

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

function repositoryAllowed(connection: { repositories?: string[] }, repository: { namespace: string; repo: string }): boolean {
  if (!connection.repositories) return true;
  const fullName = repository.namespace ? `${repository.namespace}/${repository.repo}` : repository.repo;
  return connection.repositories.includes(repository.repo) || connection.repositories.includes(fullName);
}

// AUTH-gated provider-neutral PR/MR boundary. Credentials are resolved only after
// the work-result remote identifies a provider; local-only users remain valid.
export function createPrRouter(
  db: DbClient,
  sessionSecret: string,
  secretEncKey: string,
  clients: GitProviderClients
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
    const provider = detectGitProvider(refsResult.ref);
    const connection = await getDecryptedGitConnection(db, req.userId!, provider, secretEncKey);
    if (!connection) {
      res.json({ exists: false, error: "NO_CONNECTION", provider });
      return;
    }
    try {
      const repository = repositoryFor(refsResult.ref, connection);
      if (!repositoryAllowed(connection, repository)) {
        res.json({ exists: false, error: "REPOSITORY_NOT_ALLOWED", provider });
        return;
      }
      const pr = await clients[provider].findOpenPr(repository, refsResult.ref.sourceBranch);
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
    const provider = detectGitProvider(refsResult.ref);
    const connection = await getDecryptedGitConnection(db, req.userId!, provider, secretEncKey);
    if (!connection) {
      res.status(409).json({ error: "NO_CONNECTION", provider });
      return;
    }
    const repo = repositoryFor(refsResult.ref, connection);
    if (!repositoryAllowed(connection, repo)) {
      res.status(409).json({ error: "REPOSITORY_NOT_ALLOWED", provider });
      return;
    }
    const client = clients[provider];
    const fromBranch = refsResult.ref.sourceBranch;
    const toBranch = targetBranch ?? refsResult.ref.targetBranch;

    try {
      const branchExists = await client.remoteBranchExists(repo, fromBranch);
      if (!branchExists) {
        res.status(409).json({ error: "BRANCH_NOT_PUSHED" });
        return;
      }
      const existing = await client.findOpenPr(repo, fromBranch);
      if (existing) {
        res.json({ pr: existing, existed: true });
        return;
      }
      const pr = await client.createPullRequest(repo, {
        title: title ?? `${nodeId}: ${fromBranch} -> ${toBranch}`,
        description,
        fromBranch,
        toBranch,
      });
      res.json({ pr, existed: false });
    } catch {
      res.status(502).json({ error: "GIT_PROVIDER_REQUEST_FAILED", provider });
    }
  });

  return router;
}
