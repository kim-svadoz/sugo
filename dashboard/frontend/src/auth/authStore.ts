// {user,accessToken,refreshToken,expiresAt}를 localStorage['sugo_auth']에 둔다(24h 상한).
// Plain module-level store (not React state) so the non-component API client
// (src/api/client.ts) can read/write it too without prop-drilling.

export interface AuthUser {
  id: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

const STORAGE_KEY = "sugo_auth";
const EXPIRY_CAP_MS = 24 * 60 * 60 * 1000;

function empty(): AuthState {
  return { user: null, accessToken: null, refreshToken: null, expiresAt: null };
}

function load(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as AuthState;
    if (!parsed.expiresAt || Date.now() > parsed.expiresAt) return empty();
    return parsed;
  } catch {
    return empty();
  }
}

let state: AuthState = typeof localStorage !== "undefined" ? load() : empty();
const listeners = new Set<() => void>();

export function getAuthState(): AuthState {
  return state;
}

export function setAuthState(next: AuthState): void {
  state = next;
  if (next.accessToken) {
    const capped: AuthState = {
      ...next,
      expiresAt: next.expiresAt ? Math.min(next.expiresAt, Date.now() + EXPIRY_CAP_MS) : null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  listeners.forEach((l) => l());
}

export function clearAuthState(): void {
  setAuthState(empty());
}

export function subscribeAuthState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
