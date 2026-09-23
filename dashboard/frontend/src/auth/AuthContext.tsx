import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { clearAuthState, getAuthState, setAuthState, subscribeAuthState } from "./authStore.js";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const LOCAL_DEV = import.meta.env.VITE_LOCAL_DEV === "true";

interface AuthContextValue {
  userId: string | null;
  isAuthenticated: boolean;
  login: () => void;
  handleSession: (session: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** base64url JWT payload를 검증 없이 디코드(표시용 sub/exp 추출 — 신뢰는 서버가 함). */
function decodeJwt(token: string): { sub?: string; exp?: number } {
  try {
    let b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    return JSON.parse(atob(b64)) as { sub?: string; exp?: number };
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState);

  // 공개 SaaS(§Phase 1.5): 백엔드 GitHub OAuth로 302 → 콜백에서 #session= 프래그먼트로 복귀.
  const login = useCallback(() => {
    window.location.href = `${API_BASE}${LOCAL_DEV ? "/api/auth/local" : "/api/auth/github/login"}`;
  }, []);

  // 콜백에서 받은 세션 JWT를 저장(accessToken). sub=userId, exp로 만료 설정.
  const handleSession = useCallback((session: string) => {
    const { sub, exp } = decodeJwt(session);
    setAuthState({
      user: sub ? { id: sub } : null,
      accessToken: session,
      refreshToken: null,
      expiresAt: exp ? exp * 1000 : Date.now() + 7 * 24 * 3600 * 1000,
    });
  }, []);

  const logout = useCallback(() => clearAuthState(), []);

  const value: AuthContextValue = {
    userId: state.user?.id ?? null,
    isAuthenticated: Boolean(state.user && state.accessToken),
    login,
    handleSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
