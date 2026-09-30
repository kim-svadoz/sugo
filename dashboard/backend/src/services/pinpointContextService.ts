import type { DbClient } from '../db/client.js';
import { upsertRow } from '../db/upsert.js';
import type { PinpointAgentSnapshot, PinpointClient } from '../pinpoint/client.js';
import { parseMaybeJson } from '../db/jsonColumn.js';

interface Row { base_url: string; payload: unknown; observed_at: string | null; }

export async function getPinpointContext(db: DbClient, userId: string) {
  const rows = await db.query<Row>('SELECT c.base_url, s.payload, s.observed_at FROM user_pinpoint_context c LEFT JOIN user_pinpoint_snapshots s ON s.user_id = c.user_id WHERE c.user_id = ?', [userId]);
  const row = rows[0];
  return row ? { connected: true, baseUrl: row.base_url, applications: parseMaybeJson<PinpointAgentSnapshot[]>(row.payload, []), observedAt: row.observed_at } : { connected: false, baseUrl: null, applications: [], observedAt: null };
}

export async function connectPinpointContext(db: DbClient, userId: string, baseUrl: string, client: PinpointClient) {
  const applications = await client.verify(baseUrl);
  await upsertRow(db, 'user_pinpoint_context', { user_id: userId }, { base_url: baseUrl.replace(/\/$/, ''), updated_at: new Date().toISOString() });
  return applications.length;
}

function pinpointNames(inventoryPayloads: unknown[]): string[] {
  const names = new Set<string>();
  for (const payload of inventoryPayloads.map((value) => parseMaybeJson<any[]>(value, []))) {
    for (const service of payload) for (const resource of service?.service === 'ecs' ? service.resources ?? [] : []) {
      const name = resource?.metadata?.pinpointApplicationName;
      if (typeof name === 'string' && name) names.add(name);
    }
  }
  return [...names].sort();
}

export async function refreshPinpointContext(db: DbClient, userId: string, client: PinpointClient) {
  const contexts = await db.query<{ base_url: string }>('SELECT base_url FROM user_pinpoint_context WHERE user_id = ?', [userId]);
  if (!contexts[0]) throw Object.assign(new Error('Pinpoint context is not connected'), { code: 'PINPOINT_NOT_CONNECTED' });
  const snapshots = await db.query<{ payload: unknown }>('SELECT payload FROM user_aws_context_snapshots WHERE user_id = ?', [userId]);
const names = pinpointNames(snapshots.map((item) => item.payload));
  const previous = await db.query<{ payload: unknown; observed_at: string }>('SELECT payload, observed_at FROM user_pinpoint_snapshots WHERE user_id = ?', [userId]);
  if (previous[0] && Date.now() - Date.parse(previous[0].observed_at) < 5 * 60_000) return parseMaybeJson<PinpointAgentSnapshot[]>(previous[0].payload, []);
  const to = Date.now(); const from = to - 5 * 60_000;
  const available = await client.verify(contexts[0].base_url);
  const byName = new Map(available.map((application) => [application.applicationName, application]));
  const applications = await Promise.all(names.map(async (name) => {
    const unavailable: PinpointAgentSnapshot = { applicationName: name, agentCount: 0, runningAgentCount: 0, latestHeartbeatAt: null, state: 'UNKNOWN', serviceType: null, sampleCount: 0, successCount: 0, errorCount: 0, errorRate: null, averageResponseMs: null, p95ResponseMs: null, maxResponseMs: null, apdexScore: null, signal: 'UNAVAILABLE' };
    const application = byName.get(name);
    if (!application) return unavailable;
    try {
      const [agents, metrics] = await Promise.all([client.agents(contexts[0].base_url, name, from, to), client.metrics(contexts[0].base_url, application, from, to)]);
      return { ...agents, ...metrics, serviceType: application.serviceType };
    } catch { return unavailable; }
  }));
  await upsertRow(db, 'user_pinpoint_snapshots', { user_id: userId }, { payload: JSON.stringify(applications), observed_at: new Date(to).toISOString() });
  return applications;
}

export async function disconnectPinpointContext(db: DbClient, userId: string) {
  await db.exec('DELETE FROM user_pinpoint_snapshots WHERE user_id = ?', [userId]);
  await db.exec('DELETE FROM user_pinpoint_context WHERE user_id = ?', [userId]);
}
