import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createSqliteClient } from '../src/db/sqliteClient.js';
import { createApp } from '../src/index.js';
import { syncUser } from '../src/services/syncService.js';
import { seedUserToken } from './testAuth.js';
const schema = readFileSync(join(__dirname, 'schema.sqlite.sql'), 'utf8');
describe('/api/aws-guard-policy', () => {
  it('returns defaults and persists validated policy', async () => {
    const db = createSqliteClient(); await db.execScript(schema); await syncUser(db, { userId: 'u1' });
    const auth = await seedUserToken(db, 'u1');
    const path = join(mkdtempSync(join(tmpdir(), 'aws-guard-route-')), 'policy.json');
    const { app } = await createApp({ db, awsGuardPolicyPath: path });
    expect((await request(app).get('/api/aws-guard-policy').set('Authorization', auth).expect(200)).body).toMatchObject({ directReadEnabled: true, sessionLimit: 30, dailyLimit: 200, minuteLimit: 10 });
    const next = { directReadEnabled: false, sessionLimit: 20, dailyLimit: 100, minuteLimit: 5 };
    await request(app).put('/api/aws-guard-policy').set('Authorization', auth).send(next).expect(200);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject(next);
    await request(app).put('/api/aws-guard-policy').set('Authorization', auth).send({ ...next, minuteLimit: 0 }).expect(400);
  });
});
