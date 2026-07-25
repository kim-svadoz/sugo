import { clearAuthState, getAuthState } from "../auth/authStore";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function withAuthHeaders(options: RequestInit, token: string | null): HeadersInit {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

// 공개 SaaS(§Phase 1.5): 모든 호출에 Bearer(세션 토큰) 부착 — 이제 데이터 라우트도 인증 필요.
// GitHub 세션은 갱신 엔드포인트가 없으므로 401이면 그냥 로그아웃(재로그인 유도).
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken } = getAuthState();
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: withAuthHeaders(options, accessToken) });
  if (res.status === 401) clearAuthState();
  return res;
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// PUBLIC routes (§3.1-§3.3) take userId as an explicit query param rather
// than deriving it from the Bearer token server-side.
export function withUserId(path: string, userId: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ userId, ...extra });
  return `${path}?${params.toString()}`;
}
