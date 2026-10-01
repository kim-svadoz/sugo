import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { requireUser } from '../auth/requireUser.js';
import { validateBody } from '../schemas/validate.js';

export const defaultAwsGuardPolicy = { schemaVersion: 1, directReadEnabled: true, sessionLimit: 30, dailyLimit: 200, minuteLimit: 10 } as const;
const schema = z.object({ directReadEnabled: z.boolean(), sessionLimit: z.number().int().min(1).max(10000), dailyLimit: z.number().int().min(1).max(100000), minuteLimit: z.number().int().min(1).max(1000) });

async function load(path: string) {
  try { return { ...defaultAwsGuardPolicy, ...schema.parse(JSON.parse(await readFile(path, 'utf8'))) }; }
  catch { return { ...defaultAwsGuardPolicy }; }
}

export function createAwsGuardPolicyRouter(db: DbClient, secret: string, path: string): Router {
  const router = Router();
  router.use(requireUser(db, secret));
  router.get('/', async (_req, res) => res.json(await load(path)));
  router.put('/', validateBody(schema), async (req, res) => {
    const value = { schemaVersion: 1, ...req.body };
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
    res.json(value);
  });
  return router;
}
