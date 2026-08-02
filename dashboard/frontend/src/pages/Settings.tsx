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
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-[var(--color-text-bright)]">Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)]">외부 연동을 설정합니다.</p>
      </div>

      <ApiTokensCard />

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-4">
          <span className="text-[var(--color-primary)]">⑂</span>
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Bitbucket</h2>
            <p className="text-xs text-[var(--color-text-muted)]">PR 생성을 위한 개인 액세스 토큰</p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          {status === null ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
              불러오는 중…
            </div>
          ) : status.connected ? (
            <div className="space-y-3">
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-emerald-300">
                    ✓ 연결됨 · <span className="font-mono">••••{status.hint}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDisconnect()}
                    className="shrink-0 rounded border border-rose-500/40 px-2 py-0.5 text-xs text-rose-300 hover:bg-rose-500/10"
                    title="토큰 삭제"
                  >
                    🗑 삭제
                  </button>
                </div>
                {status.updatedAt && (
                  <div className="mt-1 font-mono text-[11px] text-emerald-300/70">갱신 {status.updatedAt}</div>
                )}
                {status.baseUrl && (
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">{status.baseUrl}</div>
                )}
              </div>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                토큰은 암호화되어 저장되며 다시 표시되지 않습니다. 교체하려면 삭제 후 새로 등록하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm text-[var(--color-text)]">
                개인 액세스 토큰 (HTTP access token)
                <input
                  type="password"
                  placeholder="예: BBDC-xxxxxxxxxxxxxxxx"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && token) void handleConnect();
                  }}
                  className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
                />
              </label>
              <input
                type="text"
                placeholder="Base URL (선택, 예: https://bitbucket.example.com)"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
              />
              <button
                type="button"
                disabled={busy || !token}
                onClick={() => void handleConnect()}
                className="ck-glow-cyan rounded-md px-3 py-1.5 text-sm disabled:opacity-40"
                style={{ border: "1px solid var(--color-primary)" }}
              >
                저장
              </button>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                Repository Write 권한이면 충분합니다. 레포·브랜치는 로드맵에 기록돼 있어 별도로 입력할 필요가 없습니다.
              </p>

              {/* 설계안 토큰 발급 5단계 */}
              <details className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--color-text)]">
                  토큰 발급 방법
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  <li>Bitbucket에 로그인해 Manage account로 이동합니다.</li>
                  <li>HTTP access tokens → Create token을 누릅니다.</li>
                  <li>권한에서 Repositories · Write를 선택합니다.</li>
                  <li>(선택) 만료일을 정하고 Create를 누릅니다.</li>
                  <li>그 자리에서 한 번만 보이는 토큰을 복사해 위에 붙여넣고 저장합니다.</li>
                </ol>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
