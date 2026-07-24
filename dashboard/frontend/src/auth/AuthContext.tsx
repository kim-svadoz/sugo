import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { apiJson } from "../api/client.js";
import { clearAuthState, getAuthState, setAuthState, subscribeAuthState } from "./authStore.js";

interface AuthConfig {
  authEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

interface AuthContextValue {
  userId: string | null;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  handleCallback: (code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState);

  // §5 App.tsx: "/login" redirects to the IdP's authEndpoint via /api/auth/config.
  const login = useCallback(async () => {
    const config = await apiJson<AuthConfig>("/api/auth/config");
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scope,
    });
    window.location.href = `${config.authEndpoint}?${params.toString()}`;
  }, []);

  // "/auth/callback" exchanges the code for tokens via POST /api/auth/token.
  const handleCallback = useCallback(async (code: string) => {
    const data = await apiJson<{
      user: { id: string };
      accessToken: string;
      refreshToken?: string;
      expiresAt: number;
    }>("/api/auth/token", { method: "POST", body: JSON.stringify({ code }) });
    setAuthState({
      user: data.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt,
    });
  }, []);

  const logout = useCallback(() => {
    clearAuthState();
  }, []);

  const value: AuthContextValue = {
    userId: state.user?.id ?? null,
    isAuthenticated: Boolean(state.user && state.accessToken),
    login,
    handleCallback,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
