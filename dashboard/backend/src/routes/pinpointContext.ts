import { Router } from 'express';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import type { PinpointClient } from '../pinpoint/client.js';
import { requireUser } from '../auth/requireUser.js';
import { validateBody } from '../schemas/validate.js';
import { connectPinpointContext, disconnectPinpointContext, getPinpointContext, refreshPinpointContext } from '../services/pinpointContextService.js';

const schema = z.object({ baseUrl: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)) });
export function createPinpointContextRouter(db: DbClient, secret: string, client: PinpointClient): Router {
  const router = Router(); router.use(requireUser(db, secret));
  router.get('/', async (req, res) => res.json(await getPinpointContext(db, req.userId!)));
  router.put('/', validateBody(schema), async (req, res) => { try { res.json({ applicationCount: await connectPinpointContext(db, req.userId!, req.body.baseUrl, client) }); } catch (error) { res.status(502).json({ error: 'PINPOINT_CONNECT_FAILED', message: error instanceof Error ? error.message : String(error) }); } });
  router.post('/refresh', async (req, res) => { try { res.json({ applications: await refreshPinpointContext(db, req.userId!, client) }); } catch (error) { res.status((error as any)?.code === 'PINPOINT_NOT_CONNECTED' ? 409 : 502).json({ error: (error as any)?.code ?? 'PINPOINT_REFRESH_FAILED' }); } });
  router.delete('/', async (req, res) => { await disconnectPinpointContext(db, req.userId!); res.json({ ok: true }); });
  return router;
}
