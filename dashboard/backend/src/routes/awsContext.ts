import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import type { AwsContextClient } from "../aws/contextClient.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { connectAwsContext, disconnectAwsContext, getAwsContextStatus, refreshAllAwsContexts, refreshAwsContext, refreshAwsDeploymentImages, reorderAwsContexts, setActiveAwsContext, updateAwsContext } from "../services/awsContextService.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const connectSchema = z.object({
  name: z.string().trim().min(1).max(64),
  profile: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  region: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/),
});
const accountSchema = z.object({ name: z.string().trim().min(1).max(64) });
const execFileAsync = promisify(execFile);

async function discoveredProfiles(): Promise<Array<{ name: string; region: string | null }>> {
  const listed = await execFileAsync("aws", ["configure", "list-profiles"], { timeout: 10_000 });
  const names = listed.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  return Promise.all(names.map(async (name) => {
    try {
      const result = await execFileAsync("aws", ["configure", "get", "region", "--profile", name], { timeout: 5_000 });
      return { name, region: result.stdout.trim() || null };
    } catch { return { name, region: null }; }
  }));
}

export function createAwsContextRouter(db: DbClient, sessionSecret: string, client: AwsContextClient): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));
  router.get("/", async (req, res) => {
    const account = typeof req.query.account === "string" ? req.query.account.trim() : undefined;
    res.json(await getAwsContextStatus(db, req.userId!, account || undefined));
  });
  router.get("/profiles", async (_req, res) => {
    try { res.json({ profiles: await discoveredProfiles() }); }
    catch { res.json({ profiles: [] }); }
  });
  router.post("/order", validateBody(z.object({ names: z.array(z.string().trim().min(1).max(64)).max(100) })), async (req, res) => {
    try { await reorderAwsContexts(db, req.userId!, req.body.names); res.json({ ok: true }); }
    catch (error) { res.status(400).json({ error: (error as { code?: string }).code ?? "AWS_CONTEXT_ORDER_INVALID" }); }
  });
  router.put("/", validateBody(connectSchema), async (req, res) => {
    try {
      await connectAwsContext(db, req.userId!, req.body.name, req.body.profile, req.body.region, client);
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: "AWS_IDENTITY_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });
  router.patch("/:name", validateBody(connectSchema), async (req, res) => {
    try {
      await updateAwsContext(db, req.userId!, req.params.name, req.body.name, req.body.profile, req.body.region, client);
      res.json({ ok: true });
    } catch (error) {
      const code = (error as { code?: string }).code;
      res.status(code === "AWS_CONTEXT_NOT_FOUND" ? 404 : code === "AWS_CONTEXT_ALIAS_EXISTS" ? 409 : 502).json({ error: code ?? "AWS_IDENTITY_FAILED", message: error instanceof Error ? error.message : String(error) });
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
      const limited = code === 'AWS_REFRESH_COOLDOWN' || code === 'AWS_REFRESH_DAILY_LIMIT' || code === 'AWS_REFRESH_IN_PROGRESS';
      res.status(limited ? 429 : code === "AWS_CONTEXT_NOT_CONNECTED" ? 409 : 502).json({ error: code ?? "AWS_INVENTORY_FAILED", budget: (error as any)?.budget });
    }
  });
  router.post("/refresh-all", async (req, res) => {
    try {
      res.json({ refreshed: await refreshAllAwsContexts(db, req.userId!, client) });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const limited = code === 'AWS_REFRESH_COOLDOWN' || code === 'AWS_REFRESH_DAILY_LIMIT' || code === 'AWS_REFRESH_IN_PROGRESS';
      res.status(limited ? 429 : 502).json({ error: code ?? "AWS_INVENTORY_FAILED", message: error instanceof Error ? error.message : String(error), budget: (error as any)?.budget });
    }
  });
  router.post("/refresh-deployments", validateBody(z.object({ projectPath: z.string().min(1).max(2048) })), async (req, res) => {
    try { res.json({ refreshed: await refreshAwsDeploymentImages(db, req.userId!, client, req.body.projectPath) }); }
    catch (error) {
      const code = (error as { code?: string }).code;
      res.status(code?.startsWith("AWS_REFRESH_") ? 429 : code === "AWS_PROJECT_NOT_FOUND" ? 404 : code === "AWS_INVENTORY_STALE" ? 409 : 502).json({ error: code ?? "AWS_DEPLOYMENT_LOOKUP_FAILED", budget: (error as any)?.budget });
    }
  });
  router.delete("/:name", async (req, res) => {
    await disconnectAwsContext(db, req.userId!, req.params.name);
    res.json({ ok: true });
  });
  return router;
}
