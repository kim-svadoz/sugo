import { getAuthState } from "../auth/authStore";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function authHeaders(): Record<string, string> {
  const { accessToken } = getAuthState();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/**
 * 설계안 401 refresh — **단일 비행(single-flight)**.
 *
 * 화면 하나가 여러 엔드포인트를 동시에 부르면 만료 순간 401이 한꺼번에 터진다. 각자 refresh를
 * 부르면 같은 refreshToken으로 동시 갱신이 일어나 서버가 회전시킨 토큰끼리 서로를 무효화한다.
 * 진행 중인 refresh가 있으면 그 프라미스를 공유해 **한 번만** 부른다.
 */
let refreshing: Promise<string | null> | null = null;

function tryRefresh(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const raw = localStorage.getItem("sugo_auth");
        if (!raw) return null;
        const a = JSON.parse(raw) as { refreshToken?: string | null; user?: unknown; expiresAt?: number };
        if (!a?.refreshToken) return null;
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: a.refreshToken }),
        });
        if (!res.ok) return null;
        const t = (await res.json()) as { user?: unknown; accessToken: string; refreshToken?: string | null };
        // expiresAt은 갱신하지 않는다 — 세션 상한(24h)은 refresh로 늘어나지 않는다.
        const stored = {
          user: t.user ?? a.user,
          accessToken: t.accessToken,
          refreshToken: t.refreshToken ?? a.refreshToken,
          expiresAt: a.expiresAt,
        };
        localStorage.setItem("sugo_auth", JSON.stringify(stored));
        return t.accessToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** refresh 실패 = 세션 종료 → 로그인으로. 이미 /login이면 리다이렉트 루프를 만들지 않는다. */
export function onSessionExpired(): void {
  localStorage.removeItem("sugo_auth");
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

/**
 * 공개 SaaS(§Phase 1.5): 모든 호출에 Bearer 부착. **401이면 refresh 후 한 번만 재시도**하고,
 * refresh가 실패하면 그건 세션 종료라 로그인으로 보낸다(설계안).
 *
 * 재시도를 한 번으로 제한하는 이유: 갱신한 토큰으로도 401이면 그건 만료가 아니라 권한 문제라
 * 다시 시도해도 결과가 같다 — 무한 루프만 만든다.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const doFetch = (auth: Record<string, string>) => {
    const headers = new Headers(options.headers);
    for (const [k, v] of Object.entries(auth)) headers.set(k, v);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(url, { ...options, headers });
  };

  let res = await doFetch(authHeaders());
  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) res = await doFetch({ Authorization: `Bearer ${newToken}` });
    else onSessionExpired();
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

/** §3.3 `GET /api/workspaces/search?q=` — 설계안 툴바의 서버 전문검색(300ms 디바운스). */
export interface HistorySearchResult {
  id: string;
  workspace_name: string;
  task_id: string | null;
  task_title: string | null;
  spec_title: string | null;
  summary: string | null;
  completed_at: string | null;
  created_at: string;
}

export async function searchHistory(q: string, userId: string): Promise<HistorySearchResult[]> {
  const res = await apiJson<{ results: HistorySearchResult[] }>(withUserId("/api/workspaces/search", userId, { q }));
  return res.results ?? [];
}
