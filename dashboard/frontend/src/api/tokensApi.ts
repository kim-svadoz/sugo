import { apiJson } from "./client.js";

// 개인 API 토큰 관리(웹 세션 필요). 여기서 발급한 평문 토큰을
// 플러그인 설정(SUGO_DASHBOARD_API_TOKEN / settings.json dashboard.apiToken)에 붙여넣는다.
export interface ApiTokenSummary {
  id: number;
  name: string | null;
  hint: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function listTokens(): Promise<{ tokens: ApiTokenSummary[] }> {
  return apiJson<{ tokens: ApiTokenSummary[] }>("/api/tokens");
}

export function createToken(name?: string): Promise<{ id: number; token: string; hint: string }> {
  return apiJson<{ id: number; token: string; hint: string }>("/api/tokens", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function revokeToken(id: number): Promise<{ revoked: boolean }> {
  return apiJson<{ revoked: boolean }>(`/api/tokens/${id}`, { method: "DELETE" });
}
