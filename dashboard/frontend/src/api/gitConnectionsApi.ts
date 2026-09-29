import { apiJson } from "./client.js";

export type GitProviderId = "github" | "gitlab" | "bitbucket_server" | "aws_codecommit";

export interface GitProviderDescriptor {
  id: GitProviderId;
  label: string;
  pullRequests: boolean;
  selfHosted: boolean;
  defaultBaseUrl: string | null;
  status: "available" | "planned";
  authMode: "token" | "aws_default_chain";
}

export interface GitConnectionStatus {
  provider: GitProviderId;
  connected: boolean;
  hint: string | null;
  baseUrl: string | null;
  updatedAt: string | null;
  profile: string | null;
}

export interface GitConnectionsResponse {
  providers: GitProviderDescriptor[];
  connections: GitConnectionStatus[];
}

export function getGitConnections(): Promise<GitConnectionsResponse> {
  return apiJson("/api/git-connections");
}

export function setGitConnection(provider: GitProviderId, token?: string, baseUrl?: string, profile?: string): Promise<{ ok: true }> {
  return apiJson("/api/git-connections", { method: "PUT", body: JSON.stringify({ provider, token: token || undefined, baseUrl: baseUrl || undefined, profile: profile || undefined }) });
}

export function deleteGitConnection(provider: GitProviderId): Promise<{ ok: true }> {
  return apiJson(`/api/git-connections/${provider}`, { method: "DELETE" });
}
