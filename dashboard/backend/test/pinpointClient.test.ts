import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpPinpointClient } from '../src/pinpoint/client.js';

afterEach(() => vi.unstubAllGlobals());
describe('Pinpoint HTTP adapter', () => {
  it('reads the real Pinpoint 2.5 agent-list shape without claiming application health', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ host: [{ applicationName: 'serving-api-dev', startTimestamp: 100, status: { eventTimestamp: 900, state: { code: 100, desc: 'Running' } } }] }), { status: 200 })));
    const result = await createHttpPinpointClient().agents('https://pinpoint.example.com', 'serving-api-dev', 0, 1_000);
    expect(result).toMatchObject({ applicationName: 'serving-api-dev', agentCount: 1, runningAgentCount: 1, latestHeartbeatAt: new Date(900).toISOString(), state: 'OBSERVED', signal: 'UNAVAILABLE' });
  });
  it('summarizes Pinpoint scatter and Apdex without claiming health', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.includes('Scatter')
      ? { scatter: { dotList: [[1, 10, 1, 1, 1, 0], [2, 90, 1, 2, 0, 0], [3, 30, 1, 3, 1, 0]] } }
      : { apdexScore: 0.75, apdexFormula: { totalSamples: 3 } }), { status: 200 })));
    const result = await createHttpPinpointClient().metrics('https://pinpoint.example.com', { applicationName: 'demo', serviceType: 'SPRING_BOOT', serviceTypeCode: 1210 }, 0, 1_000);
    expect(result).toMatchObject({ sampleCount: 3, successCount: 2, errorCount: 1, averageResponseMs: 43, p95ResponseMs: 90, maxResponseMs: 90, apdexScore: 0.75, signal: 'ERRORS_OBSERVED' });
  });
  it('does not follow redirects', async () => {
    const mocked = vi.fn(async () => new Response('[]', { status: 200 })); vi.stubGlobal('fetch', mocked);
    await createHttpPinpointClient().verify('https://pinpoint.example.com');
    expect(mocked).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'error' }));
  });
});
