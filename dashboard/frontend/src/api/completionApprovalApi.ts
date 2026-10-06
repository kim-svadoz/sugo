import { apiFetch } from "./client.js";
import { getAuthState, setAuthState } from "../auth/authStore.js";
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
let renewal: Promise<boolean> | null = null;
async function repairLocalLogin(): Promise<boolean> {
  if (!renewal) renewal = (async () => {
    const current = getAuthState();
    if (!current.accessToken || !current.user || current.accessToken.startsWith("sugo_pat_")) return false;
    try {
      // Plain fetch: failure must keep the open review and its draft, not navigate to login.
      const response = await fetch(`${API_BASE}/api/auth/local/session`, { headers: { Authorization: `Bearer ${current.accessToken}` } });
      if (!response.ok) return false;
      const body = await response.json() as { userId: string; authSource: string; session: string; expiresAt: number };
      const latest = getAuthState();
      if (body.authSource !== "local" || body.userId !== current.user.id || latest.user?.id !== current.user.id || latest.accessToken !== current.accessToken) return false;
      setAuthState({ user: current.user, accessToken: body.session, refreshToken: null, expiresAt: body.expiresAt });
      return true;
    } catch { return false; }
  })().finally(() => { renewal = null; });
  return renewal;
}
/** Retry only the same explicit review action, once, after repairing an old local browser session. */
export async function postCompletionApproval(path: string, body: unknown): Promise<Response> {
  const options = { method: "POST", body: JSON.stringify(body) };
  const response = await apiFetch(path, options);
  if (response.status !== 403) return response;
  const failure = await response.clone().json().catch(() => ({})) as { error?: string };
  if (failure.error !== "HUMAN_LOGIN_REQUIRED" || !await repairLocalLogin()) return response;
  return apiFetch(path, options);
}
