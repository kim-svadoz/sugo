import { useEffect, useState } from "react";
import { deleteBitbucketToken, getBitbucketStatus, setBitbucketToken, type BitbucketStatus } from "../api/bitbucketApi.js";
import { createToken, listTokens, revokeToken, type ApiTokenSummary } from "../api/tokensApi.js";

// 공개 SaaS(§Phase 1.5): 플러그인용 개인 API 토큰 발급/관리. 발급 시 평문은 딱 한 번만 보여준다.
function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setTokens((await listTokens()).tokens);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate() {
    setBusy(true);
    try {
      const res = await createToken(name || undefined);
      setFresh(res.token);
      setName("");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: number) {
    setBusy(true);
    try {
      await revokeToken(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ck-glass ck-card space-y-3 text-sm">
      <div className="font-mono text-xs uppercase opacity-70">Plugin API Tokens</div>
      {error && <div className="text-red-400">{error}</div>}
      {fresh && (
        <div className="space-y-1 rounded border border-yellow-400/40 bg-yellow-400/5 p-2">
          <div className="text-xs opacity-80">
            지금 한 번만 표시됩니다. 플러그인 설정(SUGO_DASHBOARD_API_TOKEN)에 붙여넣으세요:
          </div>
          <code className="block break-all font-mono text-xs" style={{ color: "var(--color-primary)" }}>
            {fresh}
          </code>
          <button type="button" onClick={() => setFresh(null)} className="text-xs underline opacity-70">
            닫기
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="토큰 이름 (예: laptop)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded bg-white/5 px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCreate()}
          className="ck-glow-cyan rounded px-3 py-1 text-xs"
          style={{ border: "1px solid var(--color-primary)" }}
        >
          발급
        </button>
      </div>
      <ul className="space-y-1">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded bg-white/5 px-2 py-1">
            <span className="font-mono text-xs">
              {t.name ?? "(이름 없음)"} · ••••{t.hint}
              {t.lastUsedAt ? "" : " · 미사용"}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRevoke(t.id)}
              className="text-xs text-red-400 hover:underline"
            >
              폐기
            </button>
          </li>
        ))}
        {tokens.length === 0 && <li className="text-xs opacity-50">발급된 토큰이 없습니다.</li>}
      </ul>
    </div>
  );
}

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
      <ApiTokensCard />
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
