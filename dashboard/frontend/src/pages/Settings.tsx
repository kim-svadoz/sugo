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
import { connectAwsContext, disconnectAwsContext, getAwsContext, refreshAllAwsContexts, refreshAwsContext, selectAwsContext, type AwsContextStatus } from "../api/awsContextApi.js";
import { connectPinpointContext, disconnectPinpointContext, getPinpointContext, refreshPinpointContext, type PinpointStatus } from '../api/pinpointContextApi.js';
import { getProjectIntegrations, saveProjectIntegration, type IntegrationCandidate, type ProjectIntegration } from '../api/projectIntegrationsApi.js';
import { summarizeSageMaker } from "../lib/awsInventoryPresentation.js";
import { awsAccountMetaLabel, awsAccountOptionLabel, initialIntegrationSelection, integrationStatusLabel, isExactIntegrationCandidate, partitionIntegrationCandidates } from "../lib/projectIntegrationPresentation.js";
import { getAwsGuardPolicy, saveAwsGuardPolicy, type AwsGuardPolicy } from "../api/awsGuardPolicyApi.js";
import { snapshotAge } from "../lib/snapshotAge.js";
import { PageHeading } from "../components/PageHeading.js";
import { Activity, Boxes, ChevronDown, Cloud, GitBranch, Plus, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LOCAL_DEV = import.meta.env.VITE_LOCAL_DEV === "true";
const contextAutoRefreshDescription = "Dashboard 실행 중에는 매일 08:00 KST 자동 동기화 · 꺼져 있었다면 다음 실행 시 갱신 · 수동 동기화 가능";

type IntegrationSectionId = "aws" | "guard" | "pinpoint" | "projects" | "git";
type IntegrationViewId = IntegrationSectionId | "catalog";
const INTEGRATION_SECTIONS: ReadonlyArray<{ id: IntegrationSectionId; label: string; description: string; group: string; icon: LucideIcon }> = [
  { id: "aws", label: "AWS", description: "배포와 클라우드 리소스", group: "데이터 연결", icon: Cloud },
  { id: "pinpoint", label: "APM", description: "실행 상태와 성능 지표", group: "데이터 연결", icon: Activity },
  { id: "git", label: "Git", description: "원격 저장소와 변경 이력", group: "데이터 연결", icon: GitBranch },
  { id: "projects", label: "프로젝트 적용", description: "연결 정보를 작업 공간에 배정", group: "적용 범위", icon: Boxes },
  { id: "guard", label: "접근 정책", description: "읽기 범위와 호출 한도", group: "안전장치", icon: ShieldCheck },
];

function DetailToggle({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return <button type="button" aria-expanded={expanded} onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition hover:border-cyan-400/40 hover:text-cyan-200">
    {expanded ? "접기" : "자세히 보기"}
    <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
  </button>;
}

function ContextRefreshStatus({ observedAt, now, dailyLimit, remainingToday, nextAllowedAt, compact }: {
  observedAt: string | null;
  now: Date;
  dailyLimit?: number;
  remainingToday?: number;
  nextAllowedAt?: string | null;
  compact?: boolean;
}) {
  const age = snapshotAge(observedAt, now);
  if (compact) return <span className={`hidden text-[10px] font-mono sm:inline ${age.stale ? "text-amber-300" : "text-[var(--color-text-muted)]"}`}>마지막 동기화 {age.label}</span>;
  return <div className="mt-3 border-t border-[var(--color-border)] pt-3 text-[11px]">
    <p className="text-cyan-200/90">{contextAutoRefreshDescription}</p>
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[var(--color-text-muted)]">
      {dailyLimit != null && <span>계정별 하루 {dailyLimit}회 제한</span>}
      {remainingToday != null && <span>오늘 남음 {remainingToday}회</span>}
      {nextAllowedAt && <span>다음 가능 {new Date(nextAllowedAt).toLocaleString("ko-KR")}</span>}
      <span className={age.stale ? "text-amber-300" : "text-[var(--color-text)]"}>마지막 동기화 {age.label}</span>
    </div>
  </div>;
}

function useCurrentMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  return now;
}

const awsServiceLabels: Record<string, string> = {
  codecommit: "CodeCommit", athena: "Athena", s3: "S3", codebuild: "CodeBuild",
  codepipeline: "CodePipeline", dynamodb: "DynamoDB", elasticache: "ElastiCache",
  opensearch: "OpenSearch", cloudwatch: "CloudWatch", lambda: "Lambda", kinesis: "Kinesis", sagemaker: "SageMaker",
  ecs: "ECS",
};
function AwsContextCard({ expanded, onToggle, focused = false, onConnectionChange }: { expanded: boolean; onToggle: () => void; focused?: boolean; onConnectionChange?: (connected: boolean) => void }) {
  const now = useCurrentMinute();
  const [status, setStatus] = useState<AwsContextStatus | null>(null);
  const [accountName, setAccountName] = useState("");
  const [profile, setProfile] = useState("");
  const [region, setRegion] = useState("ap-northeast-2");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { const next = await getAwsContext(); setStatus(next); onConnectionChange?.(next.connected); setError(null); } catch (err) { setError(String(err)); }
  }
  useEffect(() => { void load(); }, []);

  async function connect() {
    setBusy(true);
    try { await connectAwsContext(accountName, profile, region); setAdding(false); setAccountName(""); setProfile(""); await refreshAwsContext(); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true);
    try { await refreshAwsContext(); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function refreshAll() {
    setBusy(true);
    try { await refreshAllAwsContexts(); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (!status?.activeAccount) return;
    setBusy(true);
    try { await disconnectAwsContext(status.activeAccount); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function select(name: string) {
    setBusy(true);
    try { await selectAwsContext(name); await load(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  return <div id="integration-aws" className="scroll-mt-24 overflow-hidden">
    <div className={`${expanded ? "border-b" : ""} border-[var(--color-border)] ${focused ? "bg-cyan-300/[0.025] px-7 py-6 sm:px-9" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>AWS Context</h2>
          <p className={`${focused ? "mt-1 text-sm" : "text-xs"} text-[var(--color-text-muted)]`}>로컬 AWS 프로필로 공용 리소스 인벤토리를 연결합니다</p>
        </div>
        <div className="flex items-center gap-2">
        {status?.connected && <>
          <ContextRefreshStatus observedAt={status.observedAt} now={now} compact />
          <button type="button" disabled={busy} onClick={() => void refreshAll()} className="rounded-md border border-cyan-400/40 px-2.5 py-1 text-xs text-cyan-200 disabled:opacity-40">{busy ? "동기화 중…" : "AWS 전체 동기화"}</button>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">연결됨</span>
        </>}
        {!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}
        </div>
      </div>
      {expanded && status?.connected && <ContextRefreshStatus observedAt={status.observedAt} now={now} dailyLimit={status.refreshBudget?.dailyLimit ?? 4} remainingToday={status.refreshBudget?.remainingToday} nextAllowedAt={status.refreshBudget?.nextAllowedAt} />}
    </div>
    {expanded && <div className={`space-y-5 ${focused ? "p-7 sm:p-9" : "p-5"}`}>
      {error && <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}
      {status === null ? <div className="text-sm text-[var(--color-text-muted)]">불러오는 중…</div> : !status.connected || adding ? <>
        {status.connected && <div className="flex items-center justify-between"><div className="text-sm font-medium text-[var(--color-text)]">AWS 계정 추가</div><button type="button" onClick={() => setAdding(false)} className="text-xs text-[var(--color-text-muted)]">취소</button></div>}
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
          <div className="mb-2 font-semibold text-cyan-200">AWS Context 연결 순서</div>
          <ol className="list-decimal space-y-1 pl-4">
            <li>AWS CLI에서 profile을 준비합니다. <code className="text-[var(--color-text)]">aws configure --profile my-account</code> 또는 AWS SSO를 사용할 수 있습니다.</li>
            <li><code className="text-[var(--color-text)]">aws sts get-caller-identity --profile my-account</code>로 로그인과 권한을 확인합니다.</li>
            <li>아래에 표시 이름·profile·region을 입력해 추가한 뒤 <b className="text-[var(--color-text)]">새로고침</b>하면 Sugo가 읽을 snapshot이 저장됩니다.</li>
          </ol>
          <p className="mt-2 text-[var(--color-text-dim)]">에이전트는 표시 이름으로 계정을 고릅니다. 이름을 지정하지 않으면 <code>default</code>를 읽습니다. 표시 이름과 다른 환경 이름(예: <code>dev</code>)을 쓰려면 <code>~/.claude/sugo/settings.json</code>의 <code>aws.environments</code>에 연결하세요.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-[var(--color-text)]">표시 이름<input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="예: 공용 계정" className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5" /></label>
          <label className="text-sm text-[var(--color-text)]">AWS profile<input value={profile} onChange={(event) => setProfile(event.target.value)} placeholder="예: team-account" className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5" /></label>
          <label className="text-sm text-[var(--color-text)]">기본 region<input value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5" /></label>
        </div>
        <button type="button" disabled={busy || !accountName || !profile || !region} onClick={() => void connect()} className="ck-glow-cyan rounded-md border border-cyan-400/50 px-3 py-1.5 text-sm disabled:opacity-40">계정 확인 후 추가</button>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">AWS CLI의 로컬 자격 증명을 읽기 전용으로 사용합니다. 키는 Dashboard에 저장하지 않습니다.</p>
      </> : <>
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.05] px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[14rem] flex-1 text-xs text-[var(--color-text-muted)]">화면에서 볼 AWS 계정
              <select value={status.activeAccount ?? ""} disabled={busy} onChange={(event) => void select(event.target.value)} className="mt-1.5 w-full rounded-md border border-emerald-400/20 bg-[var(--color-background)] px-3 py-2 text-sm text-emerald-100">
                {status.accounts.map((account) => <option key={account.name} value={account.name}>{awsAccountOptionLabel(account)}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => setAdding(true)} className="rounded-md border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">계정 추가</button>
            <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-md border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">새로고침</button>
            <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded-md border border-rose-500/30 px-3 py-2 text-sm text-rose-300">연결 해제</button>
          </div>
          {status.activeAccount && <div className="mt-2 font-mono text-[11px] text-[var(--color-text-dim)]">{awsAccountMetaLabel(status.accounts.find((account) => account.name === status.activeAccount)!)}</div>}
        </div>
        {status.inventory.some((item) => item.resources.length > 0) ? <div className="grid gap-2 sm:grid-cols-3">
          {status.inventory.filter((item) => item.resources.length > 0).map((item) => {
            if (item.service === "sagemaker") {
              const summary = summarizeSageMaker(item.resources);
              return <div key={item.service} className="rounded-lg border border-violet-400/25 bg-violet-400/[0.04] px-3 py-2">
                <div className="text-sm font-medium text-[var(--color-text)]">SageMaker AI</div>
                <div className="mt-1 text-xs text-violet-200">Endpoint {summary.endpointCount}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                  <span className="rounded bg-white/[0.04] px-1.5 py-0.5">Config {summary.endpointConfigCount}</span>
                  <span className="rounded bg-white/[0.04] px-1.5 py-0.5">Model {summary.modelCount}</span>
                  {summary.notebookCount > 0 && <span className="rounded bg-white/[0.04] px-1.5 py-0.5">Notebook {summary.notebookCount}</span>}
                </div>
                {summary.endpoints.length > 0 ? <ul className="mt-2 space-y-1">{summary.endpoints.map((endpoint) => <li key={endpoint.id} className="flex items-center justify-between gap-2 text-[11px]" title={endpoint.id}><span className="truncate font-mono text-[var(--color-text-muted)]">{endpoint.id}</span><span className={endpoint.status === "InService" ? "shrink-0 text-emerald-300" : "shrink-0 text-amber-300"}>{endpoint.status ?? "상태 미확인"}</span></li>)}</ul> : <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">서비스 중인 Endpoint 없음</p>}
              </div>;
            }
            return <div key={item.service} className="rounded-lg border border-[var(--color-border)] bg-black/10 px-3 py-2">
              <div className="text-sm"><span className="font-medium text-[var(--color-text)]">{awsServiceLabels[item.service] ?? item.service}</span><span className="float-right font-mono text-xs text-[var(--color-text-muted)]">{item.resources.length}</span></div>
              <ul className="mt-2 max-h-32 space-y-1 overflow-auto">{item.resources.map((resource) => <li key={`${resource.kind}:${resource.id}`} className="truncate font-mono text-[10px] text-[var(--color-text-muted)]" title={resource.id}>{resource.id}</li>)}</ul>
            </div>;
          })}
        </div> : <div className="rounded-lg border border-[var(--color-border)] bg-black/10 px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">표시할 AWS 리소스가 없습니다.</div>}
      </>}
    </div>}
  </div>;
}

function AwsGuardPolicyCard({ expanded, onToggle, focused = false }: { expanded: boolean; onToggle: () => void; focused?: boolean }) {
  const [policy, setPolicy] = useState<AwsGuardPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void getAwsGuardPolicy().then(setPolicy).catch((error) => setMessage(String(error))); }, []);
  async function save() {
    if (!policy) return;
    setBusy(true);
    try {
      setPolicy(await saveAwsGuardPolicy(policy));
      setMessage('저장했습니다. 다음 AWS 명령부터 적용됩니다.');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  const numberField = (label: string, key: 'sessionLimit' | 'dailyLimit' | 'minuteLimit') => <label className="text-xs text-[var(--color-text-muted)]">{label}<input type="number" min="1" value={policy?.[key] ?? ''} onChange={(event) => setPolicy((current) => current ? { ...current, [key]: Number(event.target.value) } : current)} className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)]" /></label>;
  return <div id="integration-guard" className="scroll-mt-24 overflow-hidden">
    <div className={`${expanded ? "border-b" : ""} flex items-center justify-between gap-3 border-[var(--color-border)] ${focused ? "bg-violet-300/[0.025] px-7 py-6 sm:px-9" : "px-5 py-4"}`}><div><h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>AWS 직접 조회 안전장치</h2><p className={`${focused ? "mt-1 text-sm" : "text-xs"} text-[var(--color-text-muted)]`}>{policy ? (policy.directReadEnabled ? "직접 읽기 사용 중 · 호출량 제한 적용" : "저장된 AWS Context만 사용 중") : "에이전트의 허용 목록 기반 읽기와 호출량을 제한합니다"}</p></div>{!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}</div>
    {expanded && <div className={`space-y-5 ${focused ? "p-7 sm:p-9" : "p-5"}`}>
      {!policy ? <p className="text-sm text-[var(--color-text-muted)]">불러오는 중…</p> : <>
        <label className="flex items-start justify-between gap-4 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-4 py-3"><span><b className="block text-sm text-[var(--color-text)]">에이전트 직접 AWS 읽기</b><span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-muted)]">켜도 쓰기·비밀·고비용 조회는 항상 차단됩니다. 끄면 저장된 AWS Context만 사용합니다.</span></span><input type="checkbox" checked={policy.directReadEnabled} onChange={(event) => setPolicy({ ...policy, directReadEnabled: event.target.checked })} className="mt-1" /></label>
        <div className="grid gap-3 sm:grid-cols-3">{numberField('세션당 호출', 'sessionLimit')}{numberField('하루당 호출 (KST)', 'dailyLimit')}{numberField('1분당 호출', 'minuteLimit')}</div>
        <div className="rounded-md border border-[var(--color-border)] bg-black/10 px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text-dim)]">기본값은 30 / 200 / 10입니다. 초과·넓은 시간 범위·셸 반복은 실행 전에 확인을 요청하며, 감사 로그에는 비밀값을 제거한 명령과 결정만 남깁니다.</div>
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--color-text-muted)]">{message}</span><button type="button" disabled={busy} onClick={() => void save()} className="rounded-md border border-cyan-400/40 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-40">{busy ? '저장 중…' : '정책 저장'}</button></div>
      </>}
    </div>}
  </div>;
}

function PinpointContextCard({ expanded, onToggle, focused = false, onConnectionChange }: { expanded: boolean; onToggle: () => void; focused?: boolean; onConnectionChange?: (connected: boolean) => void }) {
  const now = useCurrentMinute();
  const [status, setStatus] = useState<PinpointStatus | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() { try { const next = await getPinpointContext(); setStatus(next); onConnectionChange?.(next.connected); if (next.baseUrl) setBaseUrl(next.baseUrl); setError(null); } catch (err) { setError(String(err)); } }
  useEffect(() => { void load(); }, []);
  async function run(action: () => Promise<unknown>) { setBusy(true); try { await action(); await load(); } catch (err) { setError(String(err)); } finally { setBusy(false); } }
  return <div id="integration-pinpoint" className="scroll-mt-24 overflow-hidden">
    <div className={`${expanded ? "border-b" : ""} border-[var(--color-border)] ${focused ? "bg-cyan-300/[0.025] px-7 py-6 sm:px-9" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div><h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>Pinpoint APM</h2><p className={`${focused ? "mt-1 text-sm" : "text-xs"} text-[var(--color-text-muted)]`}>애플리케이션의 실제 실행 상태와 성능 지표를 읽습니다.</p></div>
        <div className="flex items-center gap-2">{status?.connected && <><ContextRefreshStatus observedAt={status.observedAt} now={now} compact /><button disabled={busy} onClick={() => void run(refreshPinpointContext)} className="rounded-md border border-cyan-400/40 px-2.5 py-1 text-xs text-cyan-200 disabled:opacity-40">{busy ? "동기화 중…" : "Pinpoint 동기화"}</button><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">연결됨</span></>}{!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}</div>
      </div>
      {expanded && status?.connected && <ContextRefreshStatus observedAt={status.observedAt} now={now} />}
    </div>
    {expanded && <div className={`space-y-5 ${focused ? "p-7 sm:p-9" : "p-5"}`}>
      {error && <div className="rounded border border-rose-500/30 px-3 py-2 text-xs text-rose-300">{error}</div>}
      <div className="flex gap-2"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://pinpoint.example.com" className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />
        {!status?.connected ? <button disabled={busy || !baseUrl} onClick={() => void run(() => connectPinpointContext(baseUrl))} className="rounded border border-cyan-400/40 px-3 text-sm text-cyan-200 disabled:opacity-40">연결</button> : <button disabled={busy} onClick={() => void run(disconnectPinpointContext)} className="rounded border border-rose-400/30 px-3 text-sm text-rose-300">연결 해제</button>}
      </div>
      {status?.connected && <div className="grid gap-2 sm:grid-cols-2">{status.applications.map((app) => <div key={app.applicationName} className="rounded border border-[var(--color-border)] bg-black/10 px-3 py-2 text-xs"><div className="font-medium text-[var(--color-text)]">{app.applicationName}</div><div className="mt-1 text-[var(--color-text-muted)]">{app.state} · agent {app.runningAgentCount}/{app.agentCount} · 최근 5분 지연 표본 {app.sampleCount >= 5000 ? '5,000+' : app.sampleCount} / 표본 오류 {app.errorCount}</div></div>)}</div>}
      <p className="text-[11px] text-[var(--color-text-dim)]">읽기 전용 · 5분 중복 호출 방지</p>
    </div>}
  </div>;
}

function ProjectIntegrationsCard({ expanded, onToggle, focused = false }: { expanded: boolean; onToggle: () => void; focused?: boolean }) {
  const [projects, setProjects] = useState<ProjectIntegration[]>([]); const [candidates, setCandidates] = useState<IntegrationCandidate[]>([]);
  const [path, setPath] = useState(''); const [selected, setSelected] = useState<string[]>([]); const [filter, setFilter] = useState(''); const [busy, setBusy] = useState(false);
  const key = (item: { accountName: string; service: string; cluster?: string | null }) => `${item.accountName}\u0000${item.cluster ?? ''}\u0000${item.service}`;
  async function load(nextPath?: string) { const data = await getProjectIntegrations(); setProjects(data.projects); setCandidates(data.candidates); const target = nextPath || path || data.projects[0]?.project_path || ''; const targetProject = data.projects.find((item) => item.project_path === target); setPath(target); setSelected(initialIntegrationSelection(targetProject, data.candidates, key)); }
  useEffect(() => { void load(); }, []);
  const project = projects.find((item) => item.project_path === path);
  const isSuggested = (item: IntegrationCandidate) => isExactIntegrationCandidate(path, item);
  const suggestionCount = candidates.filter(isSuggested).length;
  const partitioned = partitionIntegrationCandidates(candidates, selected, key);
  const filterCandidate = (item: IntegrationCandidate) => `${item.accountName} ${item.service} ${item.cluster ?? ''} ${item.pinpointApplicationName ?? ''}`.toLowerCase().includes(filter.toLowerCase());
  const sortCandidates = (items: IntegrationCandidate[]) => items.filter(filterCandidate).sort((left, right) => Number(isSuggested(right)) - Number(isSuggested(left)) || left.environment.localeCompare(right.environment) || left.service.localeCompare(right.service));
  const available = sortCandidates(partitioned.available);
  const applied = sortCandidates(partitioned.applied);
  const visibleCandidates = [...applied, ...available];
  const toggleSelection = (value: string) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  async function save(disable = false) { if (!path) return; setBusy(true); try { const values = disable ? [] : candidates.filter((item) => selected.includes(key(item))).map(({ accountName, service, environment, cluster }) => ({ accountName, service, environment, cluster })); await saveProjectIntegration(path, values); await load(path); } finally { setBusy(false); } }
  return <div id="integration-projects" className="scroll-mt-24 overflow-hidden">
    <div className={`${expanded ? "border-b" : ""} flex items-center justify-between gap-3 border-[var(--color-border)] ${focused ? "bg-violet-300/[0.025] px-7 py-6 sm:px-9" : "px-5 py-4"}`}><div><h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>프로젝트 외부 연동</h2><p className={`${focused ? "mt-1 text-sm" : "text-xs"} text-[var(--color-text-muted)]`}>등록 프로젝트 {projects.length}개 · 연결 설정 {projects.filter((item) => item.configured).length}개</p></div>{!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}</div>
    {expanded && <div className={`space-y-5 ${focused ? "p-7 sm:p-9" : "p-5"}`}>
      {projects.length === 0 ? <p className="text-xs text-[var(--color-text-dim)]">등록된 프로젝트가 없습니다.</p> : <>
        <div className="grid gap-4 border-y border-white/[0.07] py-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center"><div><strong className="block text-sm text-[var(--color-text)]">적용할 프로젝트</strong><span className="mt-1 block text-[10px] text-[var(--color-text-muted)]">프로젝트마다 사용할 운영 근거를 고릅니다.</span></div><select value={path} onChange={(event) => { const next = event.target.value; const nextProject = projects.find((item) => item.project_path === next); setPath(next); setSelected(initialIntegrationSelection(nextProject, candidates, key)); }} className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm">{projects.map((item) => <option key={item.project_path} value={item.project_path}>{item.workspace_name} · {item.project_path.split('/').at(-1)} · {integrationStatusLabel(item)}</option>)}</select></div>
        {project && <div className={project.configured ? "rounded border border-emerald-400/25 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-200" : "rounded border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-xs text-amber-100"}>{project.configured ? project.selections.length ? `외부 연동 ${project.selections.length}개가 확정되어 Inspector에서 AWS Synced로 사용됩니다.` : "이 프로젝트는 외부 연동을 사용하지 않도록 확정되어 있습니다." : `로컬 Workspace 등록은 완료됐지만 AWS·APM 연결은 아직 확정되지 않았습니다. 정확 일치 후보 ${suggestionCount}개를 미리 선택했습니다.`}</div>}
        <div className="flex items-center justify-between gap-4 pt-2"><div><strong className="text-sm text-[var(--color-text)]">사용할 운영 데이터</strong><span className="ml-2 font-mono text-xs text-cyan-300">{selected.length}개 선택</span></div><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="계정·서비스·환경 검색" className="w-64 max-w-[50%] rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" /></div>
        <div className="ck-scroll max-h-80 divide-y divide-white/[0.06] overflow-auto border-y border-white/[0.07]">
          {visibleCandidates.length === 0 && <div className="px-3 py-10 text-center text-xs text-[var(--color-text-dim)]">연결된 운영 데이터에서 적용 가능한 항목을 찾지 못했습니다.</div>}
          {visibleCandidates.map((item) => { const itemKey = key(item); const enabled = selected.includes(itemKey); return <label key={itemKey} className={`flex cursor-pointer items-center gap-4 px-3 py-3.5 transition ${enabled ? 'bg-cyan-300/[0.045]' : 'hover:bg-white/[0.025]'}`}><input type="checkbox" checked={enabled} onChange={() => toggleSelection(itemKey)} className="h-4 w-4 accent-cyan-300" /><span className="min-w-0 flex-1"><span className="text-sm text-[var(--color-text)]"><b className="text-cyan-200">{item.environment.toUpperCase()}</b> · {item.service}</span><span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-dim)]">{item.accountName} / {item.cluster ?? 'cluster 미확인'}{item.pinpointApplicationName ? ` / Pinpoint ${item.pinpointApplicationName}` : ''}</span></span>{isSuggested(item) && <span className="rounded-full border border-amber-400/25 px-2 py-1 text-[9px] text-amber-200">프로젝트와 일치</span>}<span className={`w-14 text-right text-[10px] font-semibold ${enabled ? 'text-emerald-300' : 'text-[var(--color-text-dim)]'}`}>{enabled ? '사용' : '미사용'}</span></label>; })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2"><p className="text-[11px] text-[var(--color-text-dim)]">선택한 데이터만 이 프로젝트의 Inspector와 AI 작업 근거에 사용합니다.</p><div className="flex gap-2"><button disabled={busy || selected.length === 0} onClick={() => void save()} className="rounded-full border border-cyan-400/40 px-4 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">{project?.configured ? '선택 내용 저장' : '프로젝트에 적용'}</button><button disabled={busy} onClick={() => void save(true)} className="rounded-full px-4 py-2 text-xs text-[var(--color-text-muted)] hover:text-rose-300">연동 없이 사용</button></div></div>
        <p className="text-[11px] text-[var(--color-text-dim)]">확정 전 후보는 Inspector에서 AWS Suggested로만 표시됩니다. 저장 후에는 AWS Synced가 되며, Pinpoint는 선택한 ECS 서비스의 에이전트 설정이 확인된 경우에만 함께 연결됩니다.</p>
      </>}
    </div>}
  </div>;
}

// 플러그인용 개인 API 토큰 발급/관리. 발급 시 평문은 딱 한 번만 보여준다.
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

function IntegrationNode({ section, selected, onSelect, align = "left", status }: {
  section: (typeof INTEGRATION_SECTIONS)[number];
  selected: boolean;
  onSelect: (id: IntegrationViewId) => void;
  align?: "left" | "right";
  status?: "connected" | "available";
}) {
  const Icon = section.icon;
  return <button
    type="button"
    aria-pressed={selected}
    onClick={() => onSelect(section.id)}
    className={`group flex min-h-16 items-center gap-3 border-l-2 px-3 py-2.5 text-left transition ${selected ? "border-cyan-300 bg-cyan-300/[0.07]" : "border-white/[0.06] hover:border-white/20 hover:bg-white/[0.025]"} ${align === "right" ? "lg:flex-row-reverse lg:border-l-0 lg:border-r-2 lg:text-right" : ""}`}
  >
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${selected ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" : "border-white/[0.08] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]"}`}><Icon size={16} /></span>
    <span className="min-w-0 flex-1"><span className={`flex items-center gap-2 ${align === "right" ? "lg:justify-end" : ""}`}><strong className={`block text-sm ${selected ? "text-cyan-100" : "text-[var(--color-text)]"}`}>{section.label}</strong>{status && <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${status === "connected" ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-300" : "border-white/10 text-[var(--color-text-dim)]"}`}>{status === "connected" ? "연결됨" : "연결 가능"}</span>}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--color-text-muted)]">{section.description}</span></span>
  </button>;
}

function IntegrationCatalog({ awsConnected, pinpointConnected, onSelect }: {
  awsConnected: boolean;
  pinpointConnected: boolean;
  onSelect: (id: IntegrationSectionId) => void;
}) {
  const options = INTEGRATION_SECTIONS.filter((section) => section.id === "aws" || section.id === "pinpoint");
  return <div className="p-7 sm:p-9">
    <p className="font-mono text-[10px] font-semibold tracking-[0.22em] text-cyan-300/70">AVAILABLE CONNECTIONS</p>
    <h2 className="mt-2 text-xl font-semibold text-[var(--color-text)]">필요한 운영 도구만 연결하세요</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">Sugo의 개발 흐름은 외부 서비스 없이도 동작합니다. 사용하는 환경만 추가하면 연결 지도와 프로젝트 설정이 그 환경에 맞춰 바뀝니다.</p>
    <div className="mt-7 divide-y divide-white/[0.07] border-y border-white/[0.07]">
      {options.map((section) => {
        const Icon = section.icon;
        const connected = section.id === "aws" ? awsConnected : pinpointConnected;
        return <button key={section.id} type="button" onClick={() => onSelect(section.id)} className="group flex w-full items-center gap-4 py-5 text-left">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-white/[0.09] text-[var(--color-text-muted)] transition group-hover:border-cyan-300/35 group-hover:text-cyan-200"><Icon size={18} /></span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="block text-base text-[var(--color-text)]">{section.label}</strong><span className={`text-[10px] font-semibold ${connected ? "text-emerald-300" : "text-[var(--color-text-dim)]"}`}>{connected ? "● 연결됨" : "미연결"}</span></span><span className="mt-1 block text-xs text-[var(--color-text-muted)]">{section.description}</span>{section.id === "aws" && <span className="mt-1.5 block text-[10px] text-violet-200/70">연결하면 프로젝트 적용과 접근 정책을 함께 설정할 수 있습니다.</span>}</span>
          <span className={`text-xs font-semibold ${connected ? "text-emerald-300" : "text-cyan-300"}`}>{connected ? "연결 관리 →" : "연결 설정 →"}</span>
        </button>;
      })}
    </div>
  </div>;
}

export function Settings() {
  const [selectedSection, setSelectedSection] = useState<IntegrationViewId>("git");
  const [awsConnected, setAwsConnected] = useState(false);
  const [pinpointConnected, setPinpointConnected] = useState(false);
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

  useEffect(() => {
    void Promise.allSettled([getAwsContext(), getPinpointContext()]).then(([aws, pinpoint]) => {
      if (aws.status === "fulfilled") setAwsConnected(aws.value.connected);
      if (pinpoint.status === "fulfilled") setPinpointConnected(pinpoint.value.connected);
      const failures = [aws, pinpoint].filter((result) => result.status === "rejected");
      if (failures.length > 0) setError("일부 연동 상태를 확인하지 못했습니다. 상세 화면에서 다시 확인하세요.");
    });
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

  const activeSourceSections = INTEGRATION_SECTIONS.filter((section) =>
    section.id === "git" || (section.id === "aws" && awsConnected) || (section.id === "pinpoint" && pinpointConnected),
  );
  const activeControlSections = awsConnected
    ? INTEGRATION_SECTIONS.filter((section) => section.id === "projects" || section.id === "guard")
    : [];
  const availableConnectionNames = [!awsConnected && "AWS", !pinpointConnected && "APM"].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeading eyebrow="SYSTEM INTEGRATIONS" title="외부 연동" description="저장소와 운영 환경을 연결하고, Sugo가 사용할 외부 서비스의 범위를 관리합니다." />

      <section aria-label="외부 연동 구조" className="relative overflow-hidden border-y border-[var(--color-border)] bg-[linear-gradient(90deg,rgba(34,211,238,0.035),transparent_42%,rgba(139,92,246,0.035))] px-4 py-7 sm:px-7">
        <div aria-hidden="true" className="absolute inset-x-[12%] top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent" />
        <div className="relative grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_11rem_minmax(0,1fr)]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3"><p className="font-mono text-[10px] font-semibold tracking-[0.22em] text-cyan-300/70">CONNECTED SOURCES</p><span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-1 text-[9px] font-semibold text-emerald-300">{activeSourceSections.length}개 사용 중</span></div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {activeSourceSections.map((section) => <IntegrationNode key={section.id} section={section} selected={selectedSection === section.id} onSelect={setSelectedSection} status="connected" />)}
              <button type="button" aria-pressed={selectedSection === "catalog"} onClick={() => setSelectedSection("catalog")} className={`flex min-h-14 items-center gap-3 border-l-2 px-3 py-2 text-left transition ${selectedSection === "catalog" ? "border-cyan-300 bg-cyan-300/[0.07] text-cyan-100" : "border-dashed border-white/[0.09] text-[var(--color-text-muted)] hover:border-cyan-300/30 hover:text-cyan-200"}`}><span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-current/30"><Plus size={15} /></span><span><strong className="block text-sm">지원 도구 관리</strong><span className="mt-0.5 block text-[10px]">{availableConnectionNames || "AWS · APM 연결 관리"}</span></span></button>
            </div>
          </div>
          <div className="relative mx-auto grid h-36 w-36 place-items-center rounded-full border border-cyan-300/25 bg-[#071422] shadow-[0_0_48px_rgba(34,211,238,0.08)]">
            <span className="absolute inset-3 rounded-full border border-dashed border-cyan-300/20" />
            <div className="text-center"><strong className="block text-lg tracking-[0.18em] text-cyan-100">SUGO</strong><span className="mt-1 block text-[10px] text-[var(--color-text-muted)]">READ-ONLY HUB</span></div>
          </div>
          <div>
            <p className="mb-3 text-right font-mono text-[10px] font-semibold tracking-[0.22em] text-violet-300/70">{awsConnected ? "AWS OPERATIONS" : "CONTROL PLANE"}</p>
            <div className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-1 ${awsConnected ? "border-r border-violet-300/15 pr-3" : ""}`}>
              {activeControlSections.map((section) => <IntegrationNode key={section.id} section={section} selected={selectedSection === section.id} onSelect={setSelectedSection} align="right" />)}
              {activeControlSections.length === 0 && <p className="border-r-2 border-dashed border-white/[0.07] px-3 py-4 text-right text-[11px] leading-5 text-[var(--color-text-dim)]">운영 데이터가 연결되면<br />프로젝트 적용과 접근 정책이 열립니다.</p>}
            </div>
          </div>
        </div>
      </section>

      {!LOCAL_DEV && <ApiTokensCard />}

      <section className="integration-workbench overflow-hidden border-y border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(15,23,42,0.78),rgba(6,12,22,0.9))] shadow-[0_20px_70px_rgba(0,0,0,0.12)]">
      {selectedSection === "catalog" && <IntegrationCatalog awsConnected={awsConnected} pinpointConnected={pinpointConnected} onSelect={setSelectedSection} />}
      {selectedSection === "aws" && <AwsContextCard expanded onToggle={() => undefined} focused onConnectionChange={setAwsConnected} />}
      {selectedSection === "pinpoint" && <PinpointContextCard expanded onToggle={() => undefined} focused onConnectionChange={setPinpointConnected} />}
      {selectedSection === "projects" && <ProjectIntegrationsCard expanded onToggle={() => undefined} focused />}
      {selectedSection === "guard" && <AwsGuardPolicyCard expanded onToggle={() => undefined} focused />}

      {selectedSection === "git" && <div id="integration-git" className="scroll-mt-24 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-cyan-300/[0.025] px-7 py-6 sm:px-9">
          <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300/20 text-[var(--color-primary)]"><GitBranch size={17} /></span>
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Git 작업 경로</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{connections.length > 0 ? `${connections.length}개 원격 서비스가 변경 이력과 연결되어 있습니다.` : "로컬 저장소만으로 작업 중입니다. 원격 서비스는 필요할 때 연결할 수 있습니다."}</p>
          </div>
          </div>
        </div>

        <div className="space-y-5 p-7 sm:p-9">
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
              <div className="border-y border-[var(--color-border)] px-1 py-4">
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
                      className={`border-l-2 px-4 py-3 text-left transition ${selected === provider.id ? "border-cyan-300 bg-cyan-300/[0.06]" : "border-white/[0.08] hover:border-white/20 hover:bg-white/[0.025]"} disabled:cursor-default disabled:opacity-50`}
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
      </div>}
      </section>
    </div>
  );
}
