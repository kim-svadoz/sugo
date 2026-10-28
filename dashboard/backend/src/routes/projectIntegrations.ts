import { Router } from 'express';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { requireUser } from '../auth/requireUser.js';
import { validateBody } from '../schemas/validate.js';
import { listProjectIntegrations, saveProjectIntegration } from '../services/projectIntegrationService.js';
import { runProjectRegistrar, type ProjectRegistrar } from '../services/projectRegistrar.js';
import { inspectLocalDirectory } from '../services/localDirectoryBrowser.js';

const schema = z.object({ projectPath: z.string().min(1).max(1024), selections: z.array(z.object({ accountName: z.string().min(1).max(191), service: z.string().min(1).max(512), environment: z.string().min(1).max(64), cluster: z.string().max(512).nullable().optional() })).max(100) });
const registrationSchema = z.object({
  projectPath: z.string().trim().min(1).max(2048),
  workspace: z.string().trim().regex(/^[A-Za-z0-9._-]+$/).refine((value) => value !== '.' && value !== '..'),
}).strict();
export function createProjectIntegrationsRouter(db: DbClient, secret: string, registrar: ProjectRegistrar = runProjectRegistrar): Router {
  const router = Router(); router.use(requireUser(db, secret));
  router.get('/', async (req, res) => res.json(await listProjectIntegrations(db, req.userId!)));
  router.get('/browse', async (req, res) => {
    try { res.json(await inspectLocalDirectory(typeof req.query.path === 'string' ? req.query.path : undefined)); }
    catch (error) { res.status(400).json({ error: (error as any)?.code ?? 'DIRECTORY_BROWSE_FAILED', message: error instanceof Error ? error.message : String(error) }); }
  });
  router.post('/register', validateBody(registrationSchema), async (req, res) => {
    try { res.status(201).json(await registrar(req.body)); }
    catch (error) { res.status(409).json({ error: (error as any)?.code ?? 'PROJECT_REGISTRATION_FAILED', message: error instanceof Error ? error.message : String(error) }); }
  });
  router.put('/', validateBody(schema), async (req, res) => { try { await saveProjectIntegration(db, req.userId!, req.body.projectPath, req.body.selections); res.json({ ok: true }); } catch (error) { const code = (error as any)?.code; res.status(code === 'PROJECT_NOT_FOUND' ? 404 : code === 'SERVICE_NOT_AVAILABLE' ? 409 : 500).json({ error: code ?? 'PROJECT_INTEGRATION_FAILED' }); } });
  return router;
}
