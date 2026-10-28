import { apiJson } from "./client.js";

export interface AwsInventoryResource {
  service: string;
  kind: string;
  id: string;
  metadata?: Record<string, unknown>;
}

export interface AwsServiceInventory {
  service: string;
  resources: AwsInventoryResource[];
  error?: string;
}

export interface AwsContextStatus {
  connected: boolean;
  activeAccount: string | null;
  accounts: Array<{ name: string; profile: string; region: string; accountHint: string; principal: string | null; displayOrder: number }>;
  profile: string | null;
  region: string | null;
  accountHint: string | null;
  principal: string | null;
  observedAt: string | null;
  inventory: AwsServiceInventory[];
  refreshBudget: { remainingToday: number; dailyLimit: number; nextAllowedAt: string | null; timezone: "Asia/Seoul" } | null;
}

export function getAwsContext(): Promise<AwsContextStatus> {
  return apiJson("/api/aws-context");
}

export function connectAwsContext(name: string, profile: string, region: string): Promise<{ ok: true }> {
  return apiJson("/api/aws-context", { method: "PUT", body: JSON.stringify({ name, profile, region }) });
}

export function updateAwsContext(currentName: string, name: string, profile: string, region: string): Promise<{ ok: true }> {
  return apiJson(`/api/aws-context/${encodeURIComponent(currentName)}`, { method: "PATCH", body: JSON.stringify({ name, profile, region }) });
}

export function selectAwsContext(name: string): Promise<{ ok: true }> {
  return apiJson("/api/aws-context/active", { method: "POST", body: JSON.stringify({ name }) });
}

export function refreshAwsContext(): Promise<{ inventory: AwsServiceInventory[] }> {
  return apiJson("/api/aws-context/refresh", { method: "POST" });
}

export function refreshAllAwsContexts(): Promise<{ refreshed: string[] }> {
  return apiJson("/api/aws-context/refresh-all", { method: "POST" });
}

export function disconnectAwsContext(name: string): Promise<{ ok: true }> {
  return apiJson(`/api/aws-context/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function getAwsProfiles(): Promise<{ profiles: Array<{ name: string; region: string | null }> }> {
  return apiJson("/api/aws-context/profiles");
}

export function reorderAwsContexts(names: string[]): Promise<{ ok: true }> {
  return apiJson("/api/aws-context/order", { method: "POST", body: JSON.stringify({ names }) });
}
