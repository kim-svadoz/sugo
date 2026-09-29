import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpPinpointClient } from '../src/pinpoint/client.js';

afterEach(() => vi.unstubAllGlobals());
describe('Pinpoint HTTP adapter', () => {
  it('reads the real Pinpoint 2.5 agent-list shape without claiming application health', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ host: [{ applicationName: 'serving-api-dev', startTimestamp: 100, status: { eventTimestamp: 900, state: { code: 100, desc: 'Running' } } }] }), { status: 200 })));
    const result = await createHttpPinpointClient().agents('https://pinpoint.example.com', 'serving-api-dev', 0, 1_000);
    expect(result).toEqual({ applicationName: 'serving-api-dev', agentCount: 1, runningAgentCount: 1, latestHeartbeatAt: new Date(900).toISOString(), state: 'OBSERVED' });
  });
  it('does not follow redirects', async () => {
    const mocked = vi.fn(async () => new Response('[]', { status: 200 })); vi.stubGlobal('fetch', mocked);
    await createHttpPinpointClient().verify('https://pinpoint.example.com');
    expect(mocked).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'error' }));
  });
});
