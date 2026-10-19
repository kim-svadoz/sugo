import { apiJson } from "./client.js";

export interface BitbucketStatus {
  connected: boolean;
  hint: string | null;
  baseUrl: string | null;
  updatedAt: string | null;
}

// AUTH-gated (Bearer) - apiFetch/apiJson already attach the token.
export function getBitbucketStatus(): Promise<BitbucketStatus> {
  return apiJson<BitbucketStatus>("/api/bitbucket");
}

export function setBitbucketToken(token: string, baseUrl?: string): Promise<{ ok: true }> {
  return apiJson("/api/bitbucket", { method: "PUT", body: JSON.stringify({ token, baseUrl }) });
}

export function deleteBitbucketToken(): Promise<{ ok: true }> {
  return apiJson("/api/bitbucket", { method: "DELETE" });
}
