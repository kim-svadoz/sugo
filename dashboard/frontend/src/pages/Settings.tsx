import { useEffect, useState } from "react";
import { deleteBitbucketToken, getBitbucketStatus, setBitbucketToken, type BitbucketStatus } from "../api/bitbucketApi.js";

// §5/§6: "Settings — Bitbucket PAT만(password 입력, PUT /api/bitbucket, ••••{hint} 표시, 삭제)."
// scope 선택은 로드맵 PR 패널에 있음(§10 로드맵 UI는 5단계에서 간소화 뷰로 미룸 - 아직 없음).
export function Settings() {
  const [status, setStatus] = useState<BitbucketStatus | null>(null);
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setStatus(await getBitbucketStatus());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleConnect() {
    setBusy(true);
    try {
      await setBitbucketToken(token, baseUrl || undefined);
      setToken("");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await deleteBitbucketToken();
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="font-mono text-lg" style={{ color: "var(--color-primary)" }}>
        Settings
      </h1>
      <div className="ck-glass ck-card space-y-3 text-sm">
        <div className="font-mono text-xs uppercase opacity-70">Bitbucket</div>
        {error && <div className="text-red-400">{error}</div>}
        {status?.connected ? (
          <div className="space-y-2">
            <div>
              연결됨: <span className="font-mono">••••{status.hint}</span>
            </div>
            {status.baseUrl && <div className="text-xs opacity-70">{status.baseUrl}</div>}
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDisconnect()}
              className="rounded border border-red-400/50 px-3 py-1 text-xs text-red-400 hover:bg-red-400/10"
            >
              연결 해제
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="password"
              placeholder="Personal Access Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded bg-white/5 px-2 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Base URL (optional, e.g. https://bitbucket.example.com)"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full rounded bg-white/5 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={busy || !token}
              onClick={() => void handleConnect()}
              className="ck-glow-cyan rounded px-3 py-1 text-xs"
              style={{ border: "1px solid var(--color-primary)" }}
            >
              연결
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
