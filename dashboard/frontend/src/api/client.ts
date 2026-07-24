import { clearAuthState, getAuthState, setAuthState } from "../auth/authStore";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const { refreshToken } = getAuthState();
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setAuthState({
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
  });
  return true;
}

// §5: "401 -> single-flight refresh -> retry -> 실패시 logout"
function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function withAuthHeaders(options: RequestInit, token: string | null): HeadersInit {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

// §5: "Authorization: Bearer 부착" on every call - PUBLIC routes (sync/workspaces)
// ignore it, AUTH routes (bitbucket/pr, later stages) require it.
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken } = getAuthState();
  let res = await fetch(`${API_BASE}${path}`, { ...options, headers: withAuthHeaders(options, accessToken) });

  if (res.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const { accessToken: newToken } = getAuthState();
      res = await fetch(`${API_BASE}${path}`, { ...options, headers: withAuthHeaders(options, newToken) });
    } else {
      clearAuthState();
    }
  }
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
