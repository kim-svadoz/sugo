import { apiJson } from './client.js';
export interface PinpointStatus { connected: boolean; baseUrl: string | null; applications: Array<{ applicationName: string; state: string; runningAgentCount: number; agentCount: number; latestHeartbeatAt: string | null; sampleCount: number; errorCount: number; errorRate: number | null; averageResponseMs: number | null; p95ResponseMs: number | null; maxResponseMs: number | null; apdexScore: number | null; signal: string }>; observedAt: string | null; }
export const getPinpointContext = () => apiJson<PinpointStatus>('/api/pinpoint-context');
export const connectPinpointContext = (baseUrl: string) => apiJson('/api/pinpoint-context', { method: 'PUT', body: JSON.stringify({ baseUrl }) });
export const refreshPinpointContext = () => apiJson('/api/pinpoint-context/refresh', { method: 'POST' });
export const disconnectPinpointContext = () => apiJson('/api/pinpoint-context', { method: 'DELETE' });
