import { getAuthState } from "../auth/authStore";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function withAuthHeaders(options: RequestInit, token: string | null): HeadersInit {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

// 공개 SaaS(§Phase 1.5): 모든 호출에 Bearer(세션 토큰) 부착.
// 개별 호출의 401은 세션을 지우지 않는다(한 엔드포인트 실패가 전역 로그아웃을 유발하면 안 됨).
// 진짜 세션 만료는 authStore의 expiresAt(로컬스토리지)로 처리한다.
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken } = getAuthState();
  return fetch(`${API_BASE}${path}`, { ...options, headers: withAuthHeaders(options, accessToken) });
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
