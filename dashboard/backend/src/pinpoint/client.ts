export interface PinpointAgentSnapshot {
  applicationName: string;
  agentCount: number;
  runningAgentCount: number;
  latestHeartbeatAt: string | null;
  state: "OBSERVED" | "STALE" | "MISSING" | "UNKNOWN";
  serviceType: string | null;
  sampleCount: number;
  successCount: number;
  errorCount: number;
  errorRate: number | null;
  averageResponseMs: number | null;
  p95ResponseMs: number | null;
  maxResponseMs: number | null;
  apdexScore: number | null;
  signal: "TRAFFIC_OK" | "ERRORS_OBSERVED" | "NO_TRAFFIC" | "UNAVAILABLE";
}

export interface PinpointApplication { applicationName: string; serviceType: string; serviceTypeCode: number; }

export interface PinpointClient {
  verify(baseUrl: string): Promise<PinpointApplication[]>;
  agents(baseUrl: string, applicationName: string, from: number, to: number): Promise<PinpointAgentSnapshot>;
  metrics(baseUrl: string, application: PinpointApplication, from: number, to: number): Promise<Pick<PinpointAgentSnapshot, 'sampleCount' | 'successCount' | 'errorCount' | 'errorRate' | 'averageResponseMs' | 'p95ResponseMs' | 'maxResponseMs' | 'apdexScore' | 'signal'>>;
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
      return (Array.isArray(payload) ? payload : []).flatMap((item: any) => typeof item?.applicationName === 'string'
        ? [{ applicationName: item.applicationName, serviceType: String(item.serviceType ?? 'UNKNOWN'), serviceTypeCode: Number(item.code) }]
        : []);
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
      return { applicationName, agentCount: agents.length, runningAgentCount: running, latestHeartbeatAt: latest === null ? null : new Date(latest).toISOString(), state, serviceType: null, sampleCount: 0, successCount: 0, errorCount: 0, errorRate: null, averageResponseMs: null, p95ResponseMs: null, maxResponseMs: null, apdexScore: null, signal: 'UNAVAILABLE' };
    },
    async metrics(baseUrl, application, from, to) {
      const scatterUrl = endpoint(baseUrl, '/getScatterData.pinpoint');
      scatterUrl.searchParams.set('application', application.applicationName);
      scatterUrl.searchParams.set('from', String(from));
      scatterUrl.searchParams.set('to', String(to));
      scatterUrl.searchParams.set('limit', '5000');
      scatterUrl.searchParams.set('filter', '');
      scatterUrl.searchParams.set('xGroupUnit', String(Math.max(1, Math.round((to - from) / 460))));
      scatterUrl.searchParams.set('yGroupUnit', '21');
      scatterUrl.searchParams.set('backwardDirection', 'true');
      const apdexUrl = endpoint(baseUrl, '/getApdexScore.pinpoint');
      apdexUrl.searchParams.set('applicationName', application.applicationName);
      apdexUrl.searchParams.set('serviceTypeCode', String(application.serviceTypeCode));
      apdexUrl.searchParams.set('from', String(from));
      apdexUrl.searchParams.set('to', String(to));
      const [scatter, apdex] = await Promise.all([json(scatterUrl), json(apdexUrl)]);
      const dots = Array.isArray(scatter?.scatter?.dotList) ? scatter.scatter.dotList.filter((dot: unknown) => Array.isArray(dot)) : [];
      const responseTimes = dots.map((dot: any[]) => Number(dot[1])).filter((value: number) => Number.isFinite(value) && value >= 0).sort((a: number, b: number) => a - b);
      const successCount = dots.filter((dot: any[]) => Number(dot[4]) === 1).length;
      const errorCount = dots.length - successCount;
      const sampleCount = dots.length;
      const percentileIndex = sampleCount ? Math.min(sampleCount - 1, Math.ceil(sampleCount * 0.95) - 1) : -1;
      return {
        sampleCount, successCount, errorCount,
        errorRate: sampleCount ? errorCount / sampleCount : null,
        averageResponseMs: sampleCount ? Math.round(responseTimes.reduce((sum: number, value: number) => sum + value, 0) / sampleCount) : null,
        p95ResponseMs: percentileIndex >= 0 ? responseTimes[percentileIndex] : null,
        maxResponseMs: sampleCount ? responseTimes[sampleCount - 1] : null,
        apdexScore: Number.isFinite(Number(apdex?.apdexScore)) && Number(apdex?.apdexFormula?.totalSamples) > 0 ? Number(apdex.apdexScore) : null,
        signal: sampleCount === 0 ? 'NO_TRAFFIC' : errorCount > 0 ? 'ERRORS_OBSERVED' : 'TRAFFIC_OK',
      };
    },
  };
}
