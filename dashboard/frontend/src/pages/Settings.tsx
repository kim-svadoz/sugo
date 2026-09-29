import { useEffect, useState } from "react";
import {
  deleteGitConnection,
  getGitConnections,
  setGitConnection,
  type GitConnectionStatus,
  type GitProviderDescriptor,
  type GitProviderId,
} from "../api/gitConnectionsApi.js";
import { createToken, listTokens, revokeToken, type ApiTokenSummary } from "../api/tokensApi.js";
import { connectAwsContext, disconnectAwsContext, getAwsContext, refreshAwsContext, type AwsContextStatus } from "../api/awsContextApi.js";

const awsServiceLabels: Record<string, string> = {
  codecommit: "CodeCommit", athena: "Athena", s3: "S3", codebuild: "CodeBuild",
  codepipeline: "CodePipeline", dynamodb: "DynamoDB", elasticache: "ElastiCache",
  opensearch: "OpenSearch", cloudwatch: "CloudWatch",
  ecs: "ECS",
};
const awsServices = Object.keys(awsServiceLabels);

function AwsContextCard() {
  const [status, setStatus] = useState<AwsContextStatus | null>(null);
  const [profile, setProfile] = useState("");
  const [region, setRegion] = useState("ap-northeast-2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { setStatus(await getAwsContext()); setError(null); } catch (err) { setError(String(err)); }
  }
  useEffect(() => { void load(); }, []);

  async function connect() {
    setBusy(true);
    try { await connectAwsContext(profile, region); await refreshAwsContext(); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true);
    try { await refreshAwsContext(); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await disconnectAwsContext(); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  return <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-text)]">AWS Context</h2>
        <p className="text-xs text-[var(--color-text-muted)]">로컬 AWS 프로필로 공용 리소스 인벤토리를 연결합니다</p>
      </div>
      {status?.connected && <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">연결됨</span>}
    </div>
    <div className="space-y-4 p-5">
      {error && <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}
      {status === null ? <div className="text-sm text-[var(--color-text-muted)]">불러오는 중…</div> : !status.connected ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-[var(--color-text)]">AWS profile<input value={profile} onChange={(event) => setProfile(event.target.value)} placeholder="예: team-account" className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5" /></label>
          <label className="text-sm text-[var(--color-text)]">기본 region<input value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5" /></label>
        </div>
        <button type="button" disabled={busy || !profile || !region} onClick={() => void connect()} className="ck-glow-cyan rounded-md border border-cyan-400/50 px-3 py-1.5 text-sm disabled:opacity-40">계정 확인 후 연결</button>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">AWS CLI의 로컬 자격 증명을 읽기 전용으로 사용합니다. 키는 Dashboard에 저장하지 않습니다.</p>
      </> : <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.05] px-4 py-3">
          <div><div className="text-sm font-medium text-emerald-200">{status.profile} · ••••{status.accountHint}</div><div className="mt-1 font-mono text-[11px] text-[var(--color-text-dim)]">{status.region} · {status.principal}</div></div>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border border-cyan-400/40 px-2.5 py-1 text-xs text-cyan-200">새로고침</button><button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded border border-rose-500/30 px-2.5 py-1 text-xs text-rose-300">연결 해제</button></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {awsServices.map((service) => {
            const item = status.inventory.find((candidate) => candidate.service === service);
            return <div key={service} className={`rounded-lg border px-3 py-2 ${item?.error || !item ? "border-amber-400/25 bg-amber-400/[0.04]" : "border-[var(--color-border)] bg-black/10"}`}>
              <div className="text-sm"><span className="font-medium text-[var(--color-text)]">{awsServiceLabels[service]}</span><span className="float-right font-mono text-xs text-[var(--color-text-muted)]">{!item ? "갱신 필요" : item.error ? "확인 필요" : item.resources.length}</span></div>
              {!item ? <div className="mt-2 text-[10px] leading-relaxed text-amber-300/75">새로고침하면 이 서비스가 스냅샷에 추가됩니다.</div> : item.error ? <div className="mt-2 break-words text-[10px] leading-relaxed text-amber-300/75">권한 또는 조회 실패</div> : item.resources.length === 0 ? <div className="mt-2 text-[10px] text-[var(--color-text-dim)]">리소스 없음</div> : <ul className="mt-2 max-h-32 space-y-1 overflow-auto">{item.resources.map((resource) => <li key={`${resource.kind}:${resource.id}`} className="truncate font-mono text-[10px] text-[var(--color-text-muted)]" title={resource.id}>{resource.id}</li>)}</ul>}
            </div>;
          })}
        </div>
        <div className="text-right font-mono text-[10px] text-[var(--color-text-dim)]">마지막 조회 {status.observedAt ?? "없음"}</div>
      </>}
    </div>
  </div>;
}

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

export function Settings() {
  const [providers, setProviders] = useState<GitProviderDescriptor[] | null>(null);
  const [connections, setConnections] = useState<GitConnectionStatus[]>([]);
  const [selected, setSelected] = useState<GitProviderId | null>(null);
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [profile, setProfile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await getGitConnections();
      setProviders(response.providers);
      setConnections(response.connections);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleConnect() {
    if (!selected) return;
    setBusy(true);
    try {
      await setGitConnection(selected, token || undefined, baseUrl || undefined, profile || undefined);
      setToken("");
      setBaseUrl("");
      setProfile("");
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect(provider: GitProviderId) {
    setBusy(true);
    try {
      await deleteGitConnection(provider);
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

      <AwsContextCard />

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-4">
          <span className="text-[var(--color-primary)]">⑂</span>
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Git 서비스 연결</h2>
            <p className="text-xs text-[var(--color-text-muted)]">로컬 사용이 기본입니다. PR/MR 자동 생성이 필요할 때만 연결하세요.</p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          {providers === null ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
              불러오는 중…
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text)]">로컬 모드</div>
                    <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">Git 서비스 없이도 Sugo의 로컬 파이프라인은 그대로 동작합니다.</div>
                  </div>
                  {connections.length === 0 && <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300">현재 사용 중</span>}
                </div>
              </div>

              {connections.map((connection) => {
                const provider = providers.find((item) => item.id === connection.provider);
                return (
                  <div key={connection.provider} className="rounded-lg border border-emerald-500/35 bg-emerald-500/8 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-emerald-200">✓ {provider?.label ?? connection.provider}</div>
                        {connection.hint && <div className="mt-1 font-mono text-xs text-emerald-300/75">••••{connection.hint}</div>}
                        {connection.provider === "aws_codecommit" && <div className="mt-1 text-xs text-emerald-300/75">AWS 자격 증명 체인{connection.profile ? ` · ${connection.profile}` : " · default"}</div>}
                        {connection.baseUrl && <div className="mt-1 font-mono text-[11px] text-[var(--color-text-dim)]">{connection.baseUrl}</div>}
                      </div>
                      <button type="button" disabled={busy} onClick={() => void handleDisconnect(connection.provider)} className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10">연결 해제</button>
                    </div>
                  </div>
                );
              })}

              <div className="grid gap-2 sm:grid-cols-2">
                {providers.map((provider) => {
                  const connected = connections.some((item) => item.provider === provider.id);
                  const planned = provider.status === "planned";
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      disabled={connected || planned}
                      onClick={() => { setSelected(provider.id); setBaseUrl(provider.defaultBaseUrl ?? ""); }}
                      className={`rounded-lg border px-3 py-3 text-left transition ${selected === provider.id ? "border-cyan-400 bg-cyan-400/10" : "border-[var(--color-border)] bg-white/[0.02] hover:bg-white/[0.04]"} disabled:cursor-default disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between gap-2 text-sm font-medium text-[var(--color-text)]">
                        {provider.label}
                        <span className="text-[10px] text-[var(--color-text-muted)]">{planned ? "지원 예정" : connected ? "연결됨" : "선택"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selected && (() => {
                const provider = providers.find((item) => item.id === selected)!;
                const requiresBaseUrl = provider.id === "bitbucket_server";
                const usesAwsCredentials = provider.authMode === "aws_default_chain";
                return <div className="space-y-3 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.03] p-4">
                  <div className="text-sm font-semibold text-[var(--color-text-bright)]">{provider.label} 연결</div>
              {usesAwsCredentials ? <>
                <div className="rounded-md border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Dashboard 서버의 AWS SDK 기본 자격 증명 체인을 사용합니다. 로컬에서는 AWS CLI/SSO 로그인을 먼저 완료하세요.
                </div>
                <label className="block text-sm text-[var(--color-text)]">
                  AWS profile (선택)
                  <input type="text" placeholder="default" value={profile} onChange={(event) => setProfile(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-sm text-[var(--color-text)]" />
                </label>
              </> : <>
              <label className="block text-sm text-[var(--color-text)]">
                개인 액세스 토큰
                <input
                  type="password"
                  placeholder="토큰은 저장 후 다시 표시되지 않습니다"
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
                placeholder={requiresBaseUrl ? "Base URL (필수)" : `Base URL (선택, 기본 ${provider.defaultBaseUrl})`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
              />
              </>}
              <button
                type="button"
                disabled={busy || (!usesAwsCredentials && !token) || (requiresBaseUrl && !baseUrl)}
                onClick={() => void handleConnect()}
                className="ck-glow-cyan rounded-md px-3 py-1.5 text-sm disabled:opacity-40"
                style={{ border: "1px solid var(--color-primary)" }}
              >
                안전하게 저장
              </button>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                {usesAwsCredentials ? "Access key를 Dashboard에 저장하지 않습니다. 프로젝트 remote에서 AWS region을 감지합니다." : "토큰은 AES-256-GCM으로 암호화됩니다. 프로젝트 remote를 감지해 같은 공급자의 연결을 사용합니다."}
              </p>
                </div>;
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
