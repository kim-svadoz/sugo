import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index.js';
import { createSqliteClient } from '../src/db/sqliteClient.js';
import type { PinpointClient } from '../src/pinpoint/client.js';
import { readFileSync } from 'node:fs';
import { syncUser } from '../src/services/syncService.js';
import { seedUserToken } from './testAuth.js';

async function fixture() {
  const db = createSqliteClient(':memory:');
  await db.execScript(readFileSync(new URL('./schema.sqlite.sql', import.meta.url), 'utf8'));
  await syncUser(db, { userId: 'local-user', displayName: 'Local' });
  await db.exec("INSERT INTO user_aws_context_snapshots (user_id, account_name, payload, observed_at) VALUES (?, ?, ?, ?)", ['local-user', 'team-dev', JSON.stringify([{ service: 'ecs', resources: [{ kind: 'service', id: 'demo-service', metadata: { pinpointApplicationName: 'demo-dev' } }] }]), new Date().toISOString()]);
  let metricCalls = 0;
  const client: PinpointClient = {
    verify: async () => [{ applicationName: 'demo-dev', serviceType: 'SPRING_BOOT', serviceTypeCode: 1210 }],
    agents: async (_url, applicationName) => ({ applicationName, agentCount: 2, runningAgentCount: 2, latestHeartbeatAt: '2026-09-30T00:00:00.000Z', state: 'OBSERVED', serviceType: null, sampleCount: 0, successCount: 0, errorCount: 0, errorRate: null, averageResponseMs: null, p95ResponseMs: null, maxResponseMs: null, apdexScore: null, signal: 'UNAVAILABLE' }),
    metrics: async () => { metricCalls += 1; return { sampleCount: 4, successCount: 4, errorCount: 0, errorRate: 0, averageResponseMs: 20, p95ResponseMs: 30, maxResponseMs: 30, apdexScore: 1, signal: 'TRAFFIC_OK' }; },
  };
  const auth = (await seedUserToken(db, 'local-user')).replace(/^Bearer /, '');
  const { app } = await createApp({ db, pinpointClient: client });
  return { app, auth, metricCalls: () => metricCalls };
}

describe('/api/pinpoint-context', () => {
  it('connects and snapshots only ECS-declared Pinpoint applications', async () => {
    const { app, auth, metricCalls } = await fixture();
    await request(app).put('/api/pinpoint-context').set('Authorization', `Bearer ${auth}`).send({ baseUrl: 'https://pinpoint.example.com' }).expect(200);
    await request(app).post('/api/pinpoint-context/refresh').set('Authorization', `Bearer ${auth}`).expect(200);
    const result = await request(app).get('/api/pinpoint-context').set('Authorization', `Bearer ${auth}`).expect(200);
    expect(result.body).toMatchObject({ connected: true, applications: [{ applicationName: 'demo-dev', state: 'OBSERVED', runningAgentCount: 2 }] });
    await request(app).post('/api/pinpoint-context/refresh').set('Authorization', `Bearer ${auth}`).expect(200);
    expect(metricCalls()).toBe(1);
  });
  it('rejects non-http protocols', async () => {
    const { app, auth } = await fixture();
    await request(app).put('/api/pinpoint-context').set('Authorization', `Bearer ${auth}`).send({ baseUrl: 'file:///etc/passwd' }).expect(400);
  });
});
