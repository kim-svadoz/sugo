import { Router } from 'express';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { requireUser } from '../auth/requireUser.js';
import { validateBody } from '../schemas/validate.js';
import { listProjectIntegrations, saveProjectIntegration } from '../services/projectIntegrationService.js';

const schema = z.object({ projectPath: z.string().min(1).max(1024), selections: z.array(z.object({ accountName: z.string().min(1).max(191), service: z.string().min(1).max(512), environment: z.string().min(1).max(64), cluster: z.string().max(512).nullable().optional() })).max(100) });
export function createProjectIntegrationsRouter(db: DbClient, secret: string): Router {
  const router = Router(); router.use(requireUser(db, secret));
  router.get('/', async (req, res) => res.json(await listProjectIntegrations(db, req.userId!)));
  router.put('/', validateBody(schema), async (req, res) => { try { await saveProjectIntegration(db, req.userId!, req.body.projectPath, req.body.selections); res.json({ ok: true }); } catch (error) { res.status((error as any)?.code === 'PROJECT_NOT_FOUND' ? 404 : 500).json({ error: (error as any)?.code ?? 'PROJECT_INTEGRATION_FAILED' }); } });
  return router;
}
