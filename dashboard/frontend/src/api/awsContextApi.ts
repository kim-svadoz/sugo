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
  profile: string | null;
  region: string | null;
  accountHint: string | null;
  principal: string | null;
  observedAt: string | null;
  inventory: AwsServiceInventory[];
}

export function getAwsContext(): Promise<AwsContextStatus> {
  return apiJson("/api/aws-context");
}

export function connectAwsContext(profile: string, region: string): Promise<{ ok: true }> {
  return apiJson("/api/aws-context", { method: "PUT", body: JSON.stringify({ profile, region }) });
}

export function refreshAwsContext(): Promise<{ inventory: AwsServiceInventory[] }> {
  return apiJson("/api/aws-context/refresh", { method: "POST" });
}

export function disconnectAwsContext(): Promise<{ ok: true }> {
  return apiJson("/api/aws-context", { method: "DELETE" });
}
