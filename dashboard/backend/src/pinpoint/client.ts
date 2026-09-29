export interface PinpointAgentSnapshot {
  applicationName: string;
  agentCount: number;
  runningAgentCount: number;
  latestHeartbeatAt: string | null;
  state: "OBSERVED" | "STALE" | "MISSING" | "UNKNOWN";
}

export interface PinpointClient {
  verify(baseUrl: string): Promise<string[]>;
  agents(baseUrl: string, applicationName: string, from: number, to: number): Promise<PinpointAgentSnapshot>;
}

function endpoint(baseUrl: string, path: string): URL {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('PINPOINT_URL_PROTOCOL_DENIED');
  url.pathname = path;
  url.search = '';
  return url;
}

async function json(url: URL): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Pinpoint HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function millis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function createHttpPinpointClient(): PinpointClient {
  return {
    async verify(baseUrl) {
      const payload = await json(endpoint(baseUrl, '/applications.pinpoint'));
      return (Array.isArray(payload) ? payload : []).map((item: any) => item?.applicationName).filter((value: unknown): value is string => typeof value === 'string');
    },
    async agents(baseUrl, applicationName, from, to) {
      const url = endpoint(baseUrl, '/getAgentList.pinpoint');
      url.searchParams.set('application', applicationName);
      url.searchParams.set('from', String(from));
      url.searchParams.set('to', String(to));
      const payload = await json(url);
      const agents = Array.isArray(payload) ? payload : Object.values(payload ?? {}).flatMap((value) => Array.isArray(value) ? value : [value]);
      const heartbeats = agents.map((agent: any) => millis(agent?.status?.eventTimestamp ?? agent?.lastDpsTimestamp ?? agent?.endTimestamp ?? agent?.startTimestamp)).filter((value): value is number => value !== null);
      const latest = heartbeats.length ? Math.max(...heartbeats) : null;
      const running = agents.filter((agent: any) => String(agent?.status?.state?.desc ?? agent?.status?.state ?? agent?.status ?? '').toUpperCase().includes('RUNNING')).length;
      const state = agents.length === 0 ? 'MISSING' : latest !== null && to - latest > 10 * 60_000 ? 'STALE' : running > 0 ? 'OBSERVED' : 'UNKNOWN';
      return { applicationName, agentCount: agents.length, runningAgentCount: running, latestHeartbeatAt: latest === null ? null : new Date(latest).toISOString(), state };
    },
  };
}
