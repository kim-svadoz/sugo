import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { awsAccountMetaLabel, awsAccountOptionLabel, hasIntegrationSelectionChanges, initialIntegrationSelection, integrationStatusLabel, isExactIntegrationCandidate, partitionIntegrationCandidates, summarizeSavedIntegrations } from "../lib/projectIntegrationPresentation.js";
import { getAwsGuardPolicy, saveAwsGuardPolicy, type AwsGuardPolicy } from "../api/awsGuardPolicyApi.js";
import { snapshotAge } from "../lib/snapshotAge.js";
import { PageHeading } from "../components/PageHeading.js";
import { Activity, ArrowRight, Boxes, Check, ChevronDown, Cloud, FolderGit2, GitBranch, HardDrive } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspaces, type WorkspaceSummary } from "../hooks/useWorkspaces.js";
import { summarizeRepositoryConnections } from "../lib/integrationConnectionSummary.js";

const LOCAL_DEV = import.meta.env.VITE_LOCAL_DEV === "true";
const contextAutoRefreshDescription = "Console이 켜져 있으면 매일 이 PC 시간 기준 08:00에 자동으로 동기화합니다. 꺼져 있었다면 다음에 켜질 때 동기화하고, 언제든 직접 동기화할 수 있습니다.";

type IntegrationSectionId = "aws" | "pinpoint" | "projects" | "git";
type IntegrationViewId = IntegrationSectionId | "catalog" | "overview";
const INTEGRATION_SECTIONS: ReadonlyArray<{ id: IntegrationSectionId; label: string; description: string; group: string; icon: LucideIcon }> = [
  { id: "aws", label: "AWS", description: "배포와 클라우드 리소스", group: "데이터 연결", icon: Cloud },
  { id: "pinpoint", label: "APM", description: "실행 상태와 성능 지표", group: "데이터 연결", icon: Activity },
  { id: "git", label: "로컬 Git", description: "이 PC의 저장소와 변경 이력", group: "데이터 연결", icon: GitBranch },
  { id: "projects", label: "프로젝트 적용", description: "연결 정보를 작업 공간에 배정", group: "적용 범위", icon: Boxes },
];

function DetailToggle({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return <button type="button" aria-expanded={expanded} onClick={onClick} className="settings-action settings-action-secondary settings-action-compact shrink-0 gap-1.5">
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
          <button type="button" disabled={busy} onClick={() => void refreshAll()} className="settings-action settings-action-secondary settings-action-compact">{busy ? "동기화 중…" : "AWS 전체 동기화"}</button>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-300">연결됨</span>
        </>}
        {!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}
        </div>
      </div>
      {expanded && status?.connected && <ContextRefreshStatus observedAt={status.observedAt} now={now} dailyLimit={status.refreshBudget?.dailyLimit ?? 4} remainingToday={status.refreshBudget?.remainingToday} nextAllowedAt={status.refreshBudget?.nextAllowedAt} />}
    </div>
    {expanded && <div className={`space-y-5 ${focused ? "p-7 sm:p-9" : "p-5"}`}>
      {error && <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}
      {status === null ? <div className="text-sm text-[var(--color-text-muted)]">불러오는 중…</div> : !status.connected || adding ? <>
        {status.connected && <div className="flex items-center justify-between"><div className="text-sm font-medium text-[var(--color-text)]">AWS 계정 추가</div><button type="button" onClick={() => setAdding(false)} className="settings-action settings-action-secondary settings-action-compact">취소</button></div>}
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
          <label className="text-sm text-[var(--color-text)]">표시 이름<input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="예: 공용 계정" className="settings-field mt-1.5 w-full" /></label>
          <label className="text-sm text-[var(--color-text)]">AWS profile<input value={profile} onChange={(event) => setProfile(event.target.value)} placeholder="예: team-account" className="settings-field mt-1.5 w-full" /></label>
          <label className="text-sm text-[var(--color-text)]">기본 region<input value={region} onChange={(event) => setRegion(event.target.value)} className="settings-field mt-1.5 w-full" /></label>
        </div>
        <button type="button" disabled={busy || !accountName || !profile || !region} onClick={() => void connect()} className="settings-action settings-action-primary">계정 확인 후 추가</button>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">AWS CLI의 로컬 자격 증명을 읽기 전용으로 사용합니다. 키는 Dashboard에 저장하지 않습니다.</p>
      </> : <>
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.05] px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[14rem] flex-1 text-xs text-[var(--color-text-muted)]">화면에서 볼 AWS 계정
              <select value={status.activeAccount ?? ""} disabled={busy} onChange={(event) => void select(event.target.value)} className="settings-field mt-1.5 w-full">
                {status.accounts.map((account) => <option key={account.name} value={account.name}>{awsAccountOptionLabel(account)}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => setAdding(true)} className="settings-action settings-action-primary">계정 추가</button>
            <button type="button" disabled={busy} onClick={() => void refresh()} className="settings-action settings-action-secondary">새로고침</button>
            <button type="button" disabled={busy} onClick={() => void disconnect()} className="settings-action settings-action-danger">연결 해제</button>
          </div>
          {status.activeAccount && <div className="mt-2 font-mono text-[11px] text-[var(--color-text-dim)]">{awsAccountMetaLabel(status.accounts.find((account) => account.name === status.activeAccount)!)}</div>}
        </div>
        {status.inventory.some((item) => item.resources.length > 0) ? <div><div className="mb-3 flex items-end justify-between gap-3"><div><strong className="text-sm text-[var(--color-text)]">가져온 운영 정보</strong><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">서비스별 개수와 일부 항목만 요약합니다.</p></div><span className="text-[10px] text-[var(--color-text-dim)]">전체 목록은 동기화 데이터에 보존</span></div><div className="divide-y divide-white/[0.07] border-y border-white/[0.08]">
          {status.inventory.filter((item) => item.resources.length > 0).map((item) => {
            if (item.service === "sagemaker") {
              const summary = summarizeSageMaker(item.resources);
              return <div key={item.service} className="grid gap-2 px-1 py-4 sm:grid-cols-[10rem_7rem_minmax(0,1fr)] sm:items-center">
                <div className="text-sm font-medium text-[var(--color-text)]">SageMaker AI</div>
                <div className="text-xs text-violet-200">Endpoint {summary.endpointCount}</div>
                <div className="truncate text-right font-mono text-[10px] text-[var(--color-text-muted)]">Config {summary.endpointConfigCount} · Model {summary.modelCount}{summary.notebookCount > 0 ? ` · Notebook ${summary.notebookCount}` : ""}</div>
              </div>;
            }
            return <div key={item.service} className="grid gap-2 px-1 py-4 sm:grid-cols-[10rem_7rem_minmax(0,1fr)] sm:items-center">
              <div className="text-sm font-medium text-[var(--color-text)]">{awsServiceLabels[item.service] ?? item.service}</div>
              <div className="font-mono text-xs text-cyan-200">{item.resources.length}개</div>
              <div className="truncate text-right font-mono text-[10px] text-[var(--color-text-muted)]" title={item.resources.map((resource) => resource.id).join(", ")}>{item.resources.slice(0, 3).map((resource) => resource.id).join(" · ")}{item.resources.length > 3 ? ` 외 ${item.resources.length - 3}개` : ""}</div>
            </div>;
          })}
        </div></div> : <div className="border-y border-[var(--color-border)] px-3 py-5 text-center text-xs text-[var(--color-text-muted)]">표시할 AWS 리소스가 없습니다.</div>}
        <AwsAccessPolicySettings />
      </>}
    </div>}
  </div>;
}

function AwsAccessPolicySettings() {
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
  const numberField = (label: string, key: 'sessionLimit' | 'dailyLimit' | 'minuteLimit') => <label className="text-xs text-[var(--color-text-muted)]">{label}<input type="number" min="1" value={policy?.[key] ?? ''} onChange={(event) => setPolicy((current) => current ? { ...current, [key]: Number(event.target.value) } : current)} className="settings-field mt-1.5 w-full" /></label>;
  return <section aria-labelledby="aws-access-policy" className="border-t border-white/[0.08] pt-7">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-violet-300/70">ACCESS POLICY</p><h3 id="aws-access-policy" className="mt-1 text-base font-semibold text-[var(--color-text)]">AWS 읽기 범위</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">연결한 AWS를 AI가 직접 조회할지와 호출 한도를 이곳에서 관리합니다.</p></div>{policy && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${policy.directReadEnabled ? "border-emerald-300/25 text-emerald-300" : "border-white/10 text-[var(--color-text-muted)]"}`}>{policy.directReadEnabled ? "직접 조회 사용" : "저장 정보만 사용"}</span>}</div>
    <div className="mt-5 space-y-5">
      {!policy ? <p className="text-sm text-[var(--color-text-muted)]">불러오는 중…</p> : <>
        <label className="flex items-start justify-between gap-4 border-y border-white/[0.08] py-4"><span><b className="block text-sm text-[var(--color-text)]">에이전트 직접 AWS 읽기</b><span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-muted)]">켜도 쓰기·비밀·고비용 조회는 차단됩니다. 끄면 위에서 동기화한 정보만 사용합니다.</span></span><input type="checkbox" checked={policy.directReadEnabled} onChange={(event) => setPolicy({ ...policy, directReadEnabled: event.target.checked })} className="mt-1" /></label>
        <div className="grid gap-3 sm:grid-cols-3">{numberField('세션당 호출', 'sessionLimit')}{numberField('하루당 호출 (KST)', 'dailyLimit')}{numberField('1분당 호출', 'minuteLimit')}</div>
        <p className="text-[11px] leading-relaxed text-[var(--color-text-dim)]">한도를 넘거나 넓은 범위를 요청하면 실행 전에 확인을 받습니다. 감사 기록에는 비밀값을 제외한 명령과 결정만 남깁니다.</p>
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--color-text-muted)]">{message}</span><button type="button" disabled={busy} onClick={() => void save()} className="settings-action settings-action-primary">{busy ? '저장 중…' : '정책 저장'}</button></div>
      </>}
    </div>
  </section>;
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
        <div className="flex items-center gap-2">{status?.connected && <><ContextRefreshStatus observedAt={status.observedAt} now={now} compact /><button disabled={busy} onClick={() => void run(refreshPinpointContext)} className="settings-action settings-action-secondary settings-action-compact">{busy ? "동기화 중…" : "Pinpoint 동기화"}</button><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-300">연결됨</span></>}{!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}</div>
      </div>
      {expanded && status?.connected && <ContextRefreshStatus observedAt={status.observedAt} now={now} />}
    </div>
    {expanded && <div className={`space-y-5 ${focused ? "p-7 sm:p-9" : "p-5"}`}>
      {error && <div className="rounded border border-rose-500/30 px-3 py-2 text-xs text-rose-300">{error}</div>}
      <div className="flex gap-2"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://pinpoint.example.com" className="settings-field min-w-0 flex-1" />
        {!status?.connected ? <button disabled={busy || !baseUrl} onClick={() => void run(() => connectPinpointContext(baseUrl))} className="settings-action settings-action-primary">연결</button> : <button disabled={busy} onClick={() => void run(disconnectPinpointContext)} className="settings-action settings-action-danger">연결 해제</button>}
      </div>
      {status?.connected && <div><div className="mb-3"><strong className="text-sm text-[var(--color-text)]">수집 중인 애플리케이션</strong><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">실행 상태와 최근 5분 성능 표본을 요약합니다.</p></div><div className="divide-y divide-white/[0.07] border-y border-white/[0.08]">{status.applications.map((app) => <div key={app.applicationName} className="grid gap-2 px-1 py-4 text-xs sm:grid-cols-[minmax(0,1fr)_8rem_14rem] sm:items-center"><div className="font-medium text-[var(--color-text)]">{app.applicationName}</div><div className={app.state === "running" ? "text-emerald-300" : "text-[var(--color-text-muted)]"}>{app.state} · agent {app.runningAgentCount}/{app.agentCount}</div><div className="text-right text-[var(--color-text-muted)]">표본 {app.sampleCount >= 5000 ? '5,000+' : app.sampleCount} · 오류 {app.errorCount}</div></div>)}</div></div>}
      <p className="text-[11px] text-[var(--color-text-dim)]">읽기 전용 · 5분 중복 호출 방지</p>
    </div>}
  </div>;
}

function ProjectIntegrationsCard({ expanded, onToggle, focused = false }: { expanded: boolean; onToggle: () => void; focused?: boolean }) {
  const [projects, setProjects] = useState<ProjectIntegration[]>([]); const [candidates, setCandidates] = useState<IntegrationCandidate[]>([]);
  const [path, setPath] = useState(''); const [selected, setSelected] = useState<string[]>([]); const [filter, setFilter] = useState(''); const [busy, setBusy] = useState(false); const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const key = (item: { accountName: string; service: string; cluster?: string | null }) => `${item.accountName}\u0000${item.cluster ?? ''}\u0000${item.service}`;
  async function load(nextPath?: string) { const data = await getProjectIntegrations(); setProjects(data.projects); setCandidates(data.candidates); const target = nextPath || path || data.projects[0]?.project_path || ''; const targetProject = data.projects.find((item) => item.project_path === target); setPath(target); setSelected(initialIntegrationSelection(targetProject, data.candidates, key)); }
  useEffect(() => { void load(); }, []);
  const project = projects.find((item) => item.project_path === path);
  const hasChanges = hasIntegrationSelectionChanges(project?.selections ?? [], selected, key);
  const savedKeys = new Set((project?.selections ?? []).map(key));
  const savedSummary = summarizeSavedIntegrations(project?.selections ?? []);
  const isSuggested = (item: IntegrationCandidate) => isExactIntegrationCandidate(path, item);
  const suggestionCount = candidates.filter(isSuggested).length;
  const partitioned = partitionIntegrationCandidates(candidates, selected, key);
  const filterCandidate = (item: IntegrationCandidate) => `${item.accountName} ${item.service} ${item.cluster ?? ''} ${item.pinpointApplicationName ?? ''}`.toLowerCase().includes(filter.toLowerCase());
  const sortCandidates = (items: IntegrationCandidate[]) => items.filter(filterCandidate).sort((left, right) => Number(isSuggested(right)) - Number(isSuggested(left)) || left.environment.localeCompare(right.environment) || left.service.localeCompare(right.service));
  const available = sortCandidates(partitioned.available);
  const applied = sortCandidates(partitioned.applied);
  const visibleCandidates = [...applied, ...available];
  const toggleSelection = (value: string) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  async function save(disable = false) { if (!path) return; setBusy(true); setSaveMessage(null); try { const values = disable ? [] : candidates.filter((item) => selected.includes(key(item))).map(({ accountName, service, environment, cluster }) => ({ accountName, service, environment, cluster })); await saveProjectIntegration(path, values); await load(path); setSaveMessage(disable ? "외부 운영 정보 사용을 해제했습니다." : `${values.length}개 운영 서비스를 연결했습니다.`); } finally { setBusy(false); } }
  return <div id="integration-projects" className="scroll-mt-24 overflow-hidden">
    <div className={`${expanded ? "border-b" : ""} flex items-center justify-between gap-3 border-[var(--color-border)] ${focused ? "bg-violet-300/[0.025] px-7 py-6 sm:px-9" : "px-5 py-4"}`}><div><h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>프로젝트 외부 연동</h2><p className={`${focused ? "mt-1 text-sm" : "text-xs"} text-[var(--color-text-muted)]`}>등록 프로젝트 {projects.length}개, 연결 설정 {projects.filter((item) => item.configured).length}개</p></div>{!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}</div>
    {expanded && <div className={`space-y-5 ${focused ? "p-7 sm:p-9" : "p-5"}`}>
      <div className="break-keep border-y border-cyan-300/15 bg-cyan-300/[0.025] px-5 py-4">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <strong className="text-sm text-cyan-100">연결 방법</strong>
            <p className="mt-1.5 text-[12.5px] leading-6 text-[var(--color-text-muted)]">Sugo 프로젝트를 AWS에서 돌고 있는 ECS 서비스와 연결합니다.</p>
            <p className="text-[12.5px] leading-6 text-[var(--color-text-muted)]">저장한 연결은 Workspaces Inspector와 Schedule의 배포 상태(DEV, STG, PRD)에 쓰입니다.</p>
          </div>
          <Link to="/sessions" className="settings-action settings-action-secondary settings-action-compact shrink-0">Workspaces 열기</Link>
        </div>
        <ol className="mt-4 grid gap-x-6 gap-y-3 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
          <li className="flex gap-2.5"><span className="font-mono text-[12px] text-cyan-300">01</span><span className="min-w-0"><b className="block text-[13px] text-[var(--color-text)]">프로젝트 등록</b><span className="mt-0.5 block text-[12px] leading-5 text-[var(--color-text-dim)]"><code className="font-mono text-[11px] text-cyan-200">/sugo:add</code>로 저장소를 도메인에 등록</span></span></li>
          <li className="flex gap-2.5"><span className="font-mono text-[12px] text-cyan-300">02</span><span className="min-w-0"><b className="block text-[13px] text-[var(--color-text)]">AWS 동기화</b><span className="mt-0.5 block text-[12px] leading-5 text-[var(--color-text-dim)]">계정을 동기화하면 ECS 서비스가 후보로 표시</span></span></li>
          <li className="flex gap-2.5"><span className="font-mono text-[12px] text-cyan-300">03</span><span className="min-w-0"><b className="block text-[13px] text-[var(--color-text)]">확인 후 저장</b><span className="mt-0.5 block text-[12px] leading-5 text-[var(--color-text-dim)]">일치 후보는 미리 체크, 저장해야 연결</span></span></li>
        </ol>
        <p className="mt-4 rounded-lg bg-black/20 px-3 py-2 text-[11.5px] leading-5 text-[var(--color-text-dim)]"><b className="text-amber-200">프로젝트와 일치</b> 기준: 저장소 폴더 이름이 ECS 서비스 이름(끝의 <code className="font-mono">-service</code> 제외) 또는 컨테이너 이미지 이름과 같습니다. 다르면 목록에서 직접 고릅니다.</p>
      </div>
      {projects.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-5"><p className="text-xs text-[var(--color-text-dim)]">아직 등록된 프로젝트가 없습니다. <code className="font-mono text-[11px] text-cyan-200">/sugo:add</code>로 저장소를 도메인에 등록하면 이곳에서 운영 정보를 연결할 수 있습니다.</p><Link to="/sessions" className="settings-action settings-action-primary">Workspaces 열기</Link></div> : <>
        <div className="grid gap-4 border-y border-white/[0.07] py-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center"><div><strong className="block text-sm text-[var(--color-text)]">적용할 프로젝트</strong><span className="mt-1 block text-[10px] text-[var(--color-text-muted)]">프로젝트마다 사용할 운영 근거를 고릅니다.</span></div><select value={path} onChange={(event) => { const next = event.target.value; const nextProject = projects.find((item) => item.project_path === next); setPath(next); setSelected(initialIntegrationSelection(nextProject, candidates, key)); setSaveMessage(null); }} className="settings-field w-full">{projects.map((item) => <option key={item.project_path} value={item.project_path}>{item.workspace_name} / {item.project_path.split('/').at(-1)} ({integrationStatusLabel(item)})</option>)}</select></div>
        {saveMessage && <div role="status" className="border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-xs font-semibold text-emerald-200">✓ {saveMessage}</div>}
        {project && project.configured && project.selections.length > 0 ? <section aria-label="현재 연결된 운영 서비스" className="border-y border-emerald-300/20 bg-emerald-300/[0.025] px-4 py-4"><div className="flex items-center justify-between gap-3"><div><strong className="text-sm text-emerald-200">현재 연결됨</strong><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">저장과 동기화가 끝나 Inspector와 일정에서 사용하는 운영 서비스입니다.</p></div><span className="font-mono text-xs text-emerald-300">{project.selections.length}개</span></div><div className="mt-3 flex flex-wrap gap-2">{savedSummary.flatMap((group) => group.services.map((service) => <span key={`${group.environment}-${service}`} className="border border-emerald-300/15 bg-black/15 px-2.5 py-1.5 text-[11px] text-[var(--color-text)]"><b className="mr-1.5 font-mono text-emerald-300">{group.environment}</b>{service}</span>))}</div></section> : project && <div className={project.configured ? "border-y border-white/[0.08] px-4 py-3 text-xs text-[var(--color-text-muted)]" : "border-y border-amber-400/20 bg-amber-400/[0.035] px-4 py-3 text-xs text-amber-100"}>{project.configured ? "이 프로젝트는 외부 운영 정보를 사용하지 않도록 저장되어 있습니다." : `아직 저장된 연결이 없습니다. 일치 후보 ${suggestionCount}개는 제안일 뿐이며 저장 전에는 적용되지 않습니다.`}</div>}
        <div className="flex items-center justify-between gap-4 pt-2"><div><strong className="text-sm text-[var(--color-text)]">사용할 운영 데이터</strong><span className="ml-2 font-mono text-xs text-cyan-300">{selected.length}개 선택</span></div><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="계정, 서비스, 환경 검색" className="settings-field w-64 max-w-[50%]" /></div>
        <div className="ck-scroll max-h-80 divide-y divide-white/[0.06] overflow-auto border-y border-white/[0.07]">
          {visibleCandidates.length === 0 && <div className="px-3 py-10 text-center text-xs text-[var(--color-text-dim)]">연결된 운영 데이터에서 적용 가능한 항목을 찾지 못했습니다.</div>}
          {visibleCandidates.map((item) => { const itemKey = key(item); const enabled = selected.includes(itemKey); const saved = savedKeys.has(itemKey); const state = saved === enabled ? (saved ? '연결됨' : '미사용') : (enabled ? '저장 예정' : '해제 예정'); return <label key={itemKey} className={`flex cursor-pointer items-center gap-4 px-3 py-3.5 transition ${enabled ? 'bg-cyan-300/[0.045]' : 'hover:bg-white/[0.025]'}`}><input type="checkbox" checked={enabled} onChange={() => { toggleSelection(itemKey); setSaveMessage(null); }} className="h-4 w-4 accent-cyan-300" /><span className="min-w-0 flex-1"><span className="text-sm text-[var(--color-text)]"><b className="text-cyan-200">{item.environment.toUpperCase()}</b> {item.service}</span><span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-dim)]">{item.accountName} / {item.cluster ?? 'cluster 미확인'}{item.pinpointApplicationName ? ` / Pinpoint ${item.pinpointApplicationName}` : ''}</span></span>{isSuggested(item) && <span className="rounded-full border border-amber-400/25 px-2 py-1 text-[11px] text-amber-200">프로젝트와 일치</span>}<span className={`w-16 text-right text-[11px] font-semibold ${state === '연결됨' ? 'text-emerald-300' : state.includes('예정') ? 'text-amber-200' : 'text-[var(--color-text-dim)]'}`}>{state}</span></label>; })}
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 transition ${hasChanges ? 'border-amber-300/25 bg-amber-300/[0.035]' : 'border-white/[0.07]'}`}><p className={`text-[11px] ${hasChanges ? 'font-semibold text-amber-100' : 'text-[var(--color-text-dim)]'}`}>{hasChanges ? '저장하지 않은 변경이 있습니다. 저장해야 실제 연결에 반영됩니다.' : '저장된 연결과 현재 선택이 같습니다.'}</p><div className="flex gap-2"><button disabled={busy || selected.length === 0 || !hasChanges} onClick={() => void save()} className="settings-action settings-action-primary">{busy ? '저장 중…' : '변경 내용 저장'}</button><button disabled={busy || (project?.configured && project.selections.length === 0)} onClick={() => void save(true)} className="settings-action settings-action-secondary">운영 정보 사용 안 함</button></div></div>
        <p className="text-[11px] text-[var(--color-text-dim)]">저장 전에는 Inspector에 제안으로만 보이고, 저장하면 연결된 운영 정보로 바뀝니다. Pinpoint는 선택한 ECS 서비스에서 에이전트 설정이 확인될 때 함께 연결됩니다.</p>
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
          <button type="button" onClick={() => setFresh(null)} className="settings-action settings-action-secondary settings-action-compact">
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
          className="settings-field flex-1"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCreate()}
          className="settings-action settings-action-primary settings-action-compact"
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
              className="settings-action settings-action-danger settings-action-compact"
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
  status?: "connected" | "available" | "local";
}) {
  const Icon = section.icon;
  return <button
    type="button"
    aria-pressed={selected}
    onClick={() => onSelect(section.id)}
    className={`group flex min-h-16 items-center gap-3 border-l-2 px-3 py-2.5 text-left transition ${selected ? "border-cyan-300 bg-cyan-300/[0.07]" : "border-white/[0.06] hover:border-white/20 hover:bg-white/[0.025]"} ${align === "right" ? "lg:flex-row-reverse lg:border-l-0 lg:border-r-2 lg:text-right" : ""}`}
  >
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${selected ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" : "border-white/[0.08] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]"}`}><Icon size={16} /></span>
    <span className="min-w-0 flex-1"><span className={`flex items-center gap-2 ${align === "right" ? "lg:justify-end" : ""}`}><strong className={`block text-sm ${selected ? "text-cyan-100" : "text-[var(--color-text)]"}`}>{section.label}</strong>{status && <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${status === "connected" ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-300" : "border-white/10 text-[var(--color-text-dim)]"}`}>{status === "connected" ? "연결됨" : status === "local" ? "로컬 사용" : "연결 가능"}</span>}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--color-text-muted)]">{section.description}</span></span>
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
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">외부 서비스 없이도 개발 흐름은 동작합니다. 필요한 운영 도구만 연결하면 관련 설정이 열립니다.</p>
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

function ConnectionJourney({ projectCount, remoteCount, remoteSummary, permissionCount, awsConnected, pinpointConnected, onOpenGit }: {
  projectCount: number;
  remoteCount: number;
  remoteSummary: string;
  permissionCount: number;
  awsConnected: boolean;
  pinpointConnected: boolean;
  onOpenGit: () => void;
}) {
  const operationalCount = Number(awsConnected) + Number(pinpointConnected);
  return <section aria-label="프로젝트 연결 순서" className="overflow-hidden border-y border-[var(--color-border)] bg-[linear-gradient(90deg,rgba(34,211,238,0.035),transparent_54%,rgba(139,92,246,0.035))]">
    <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center bg-cyan-300/[0.08] text-cyan-200"><GitBranch size={18} /></span>
        <div><strong className="block text-base text-[var(--color-text)]">로컬 Git은 준비됐습니다</strong><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{projectCount > 0 ? `${projectCount}개 프로젝트의 브랜치와 변경 이력을 읽고 있습니다.` : "프로젝트가 등록되면 브랜치와 변경 이력을 읽습니다."} 원격 서비스 연결과는 별개의 상태입니다.</p></div>
      </div>
      <span className="w-max bg-white/[0.035] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)]">로컬 사용 중</span>
    </div>
    <ol className="grid sm:grid-cols-2 lg:grid-cols-4">
      <li className="flex min-h-20 items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:border-r lg:border-b-0"><span className="font-mono text-xs text-emerald-300">01</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--color-text)]">로컬 프로젝트</strong><small className="mt-1 block text-[11px] text-[var(--color-text-muted)]">자동 확인 · {projectCount}개</small></span><Check size={15} className="text-emerald-300" /></li>
      <li className={`flex min-h-20 items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 lg:border-b-0 lg:border-r ${remoteCount === 0 ? "bg-cyan-300/[0.055]" : ""}`}><span className="font-mono text-xs text-cyan-300">02</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--color-text)]">프로젝트 원격 저장소</strong><small className="mt-1 block text-[11px] text-[var(--color-text-muted)]">{remoteCount > 0 ? `${remoteSummary} · ${remoteCount}개 프로젝트` : "감지된 remote 없음"}</small></span><button type="button" onClick={onOpenGit} className="text-cyan-300" aria-label="프로젝트 저장소 현황 열기"><ArrowRight size={16} /></button></li>
      <li className="flex min-h-20 items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:border-r lg:border-b-0"><span className="font-mono text-xs text-violet-300">03</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--color-text)]">저장소 작업 권한</strong><small className="mt-1 block text-[11px] text-[var(--color-text-muted)]">선택 기능 · {permissionCount > 0 ? `${permissionCount}개 설정` : "미설정"}</small></span></li>
      <li className="flex min-h-20 items-center gap-3 px-5 py-4"><span className="font-mono text-xs text-amber-300">04</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--color-text)]">운영 정보</strong><small className="mt-1 block text-[11px] text-[var(--color-text-muted)]">선택 기능 · {operationalCount}개 사용</small></span></li>
    </ol>
  </section>;
}

function ProjectGitConnections({ workspaces }: { workspaces: WorkspaceSummary[] | null }) {
  const projects = Array.from(new Map((workspaces ?? []).flatMap((workspace) => workspace.projects).map((project) => [project.project_path, project])).values());
  if (projects.length === 0) return <div className="border-y border-[var(--color-border)] px-1 py-5 text-sm text-[var(--color-text-muted)]">등록된 로컬 프로젝트가 없습니다.</div>;
  return <section aria-label="프로젝트별 저장소 연결" className="border-y border-[var(--color-border)]">
    <div className="flex items-end justify-between gap-3 border-b border-[var(--color-border)] px-1 py-4"><div><strong className="text-sm text-[var(--color-text)]">프로젝트별 연결</strong><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">origin URL을 읽어 로컬 프로젝트와 원격 저장소를 구분합니다.</p></div><span className="text-[10px] text-[var(--color-text-dim)]">{projects.length}개 프로젝트</span></div>
    <div className="divide-y divide-white/[0.07]">
      {projects.map((project) => { const confirmedOperations = project.aws_deployments.filter((item) => item.linkMode === "confirmed").length; const suggestedOperations = project.aws_deployments.filter((item) => item.linkMode === "suggested").length; return <div key={project.project_path} className="grid gap-4 px-1 py-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(8rem,.55fr)_minmax(11rem,.8fr)_minmax(10rem,.7fr)] sm:items-center">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center bg-cyan-300/[0.06] text-cyan-300"><FolderGit2 size={16} /></span><span className="min-w-0"><strong className="block truncate font-mono text-sm text-[var(--color-text)]">{project.project_path.split(/[\\/]/).filter(Boolean).pop()}</strong><small className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-dim)]">{project.project_path}</small></span></div>
        <div><small className="block text-[10px] text-[var(--color-text-dim)]">코드 이력</small><span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-text)]"><HardDrive size={13} className="text-[var(--color-text-muted)]" />{project.local_git.headCommit ? "로컬 Git 사용 중" : "Git 확인 안 됨"}</span></div>
        <div><small className="block text-[10px] text-[var(--color-text-dim)]">원격 저장소</small>{project.remote_git ? <><span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-cyan-200"><Cloud size={13} />{project.remote_git.providerLabel}</span><span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-muted)]">{project.remote_git.repository}</span></> : <span className="mt-1 block text-xs text-[var(--color-text-muted)]">연결된 origin 없음</span>}</div>
        <div><small className="block text-[10px] text-[var(--color-text-dim)]">운영 정보</small>{confirmedOperations > 0 ? <span className="mt-1 block text-xs font-semibold text-emerald-300">ECS/APM {confirmedOperations}개 연결됨</span> : suggestedOperations > 0 ? <span className="mt-1 block text-xs text-amber-200">후보 {suggestedOperations}개 · 저장 필요</span> : <span className="mt-1 block text-xs text-[var(--color-text-muted)]">연결 없음</span>}</div>
      </div>})}
    </div>
  </section>;
}

export function Settings() {
  const [selectedSection, setSelectedSection] = useState<IntegrationViewId>("overview");
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
  const { data: workspaces } = useWorkspaces();

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

  const repositorySummary = summarizeRepositoryConnections(workspaces);

  return (
    <div className="settings-interface mx-auto max-w-6xl space-y-6">
      <PageHeading eyebrow="SYSTEM INTEGRATIONS" title="외부 연동" description="저장소와 운영 환경을 연결하고, Sugo가 사용할 외부 서비스의 범위를 관리합니다." />

      <ConnectionJourney projectCount={repositorySummary.projectCount} remoteCount={repositorySummary.remoteProjectCount} remoteSummary={repositorySummary.providerSummary} permissionCount={connections.length} awsConnected={awsConnected} pinpointConnected={pinpointConnected} onOpenGit={() => setSelectedSection("overview")} />

      <nav aria-label="연동 설정" className="flex flex-wrap items-center gap-x-1 border-y border-[var(--color-border)] px-2">
        {[{ id: "overview" as const, label: "연결 현황" }, { id: "projects" as const, label: "프로젝트 매핑" }, { id: "git" as const, label: "저장소 작업 권한" }, { id: "catalog" as const, label: "운영 도구" }, { id: "aws" as const, label: `AWS${awsConnected ? " · 연결됨" : ""}` }, { id: "pinpoint" as const, label: `APM${pinpointConnected ? " · 연결됨" : ""}` }].map((item) => <button key={item.id} type="button" aria-pressed={selectedSection === item.id} onClick={() => setSelectedSection(item.id)} className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${selectedSection === item.id ? "border-cyan-300 text-cyan-100" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>{item.label}</button>)}
      </nav>

      {!LOCAL_DEV && <ApiTokensCard />}

      <section className="integration-workbench overflow-hidden border-y border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(15,23,42,0.78),rgba(6,12,22,0.9))] shadow-[0_20px_70px_rgba(0,0,0,0.12)]">
      {selectedSection === "catalog" && <IntegrationCatalog awsConnected={awsConnected} pinpointConnected={pinpointConnected} onSelect={setSelectedSection} />}
      {selectedSection === "aws" && <AwsContextCard expanded onToggle={() => undefined} focused onConnectionChange={setAwsConnected} />}
      {selectedSection === "pinpoint" && <PinpointContextCard expanded onToggle={() => undefined} focused onConnectionChange={setPinpointConnected} />}
      {selectedSection === "projects" && <ProjectIntegrationsCard expanded onToggle={() => undefined} focused />}

      {(selectedSection === "overview" || selectedSection === "git") && <div id="integration-git" className="scroll-mt-24 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-cyan-300/[0.025] px-7 py-6 sm:px-9">
          <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300/20 text-[var(--color-primary)]"><GitBranch size={17} /></span>
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">{selectedSection === "overview" ? "연결 현황" : "저장소 작업 권한"}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedSection === "overview" ? <>등록 프로젝트 {repositorySummary.projectCount}개 중 {repositorySummary.remoteProjectCount}개에서 원격 저장소를 감지했습니다.{repositorySummary.providerSummary ? ` · ${repositorySummary.providerSummary}` : ""}</> : "Sugo가 GitHub·GitLab·CodeCommit에서 PR을 직접 조회하거나 만들 때만 설정합니다."}</p>
          </div>
          </div>
        </div>

        <div className="space-y-5 p-7 sm:p-9">
          {selectedSection === "overview" && <ProjectGitConnections workspaces={workspaces} />}
          {selectedSection === "git" && <>
          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}
          </>}

          {selectedSection === "git" && (providers === null ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
              불러오는 중…
            </div>
          ) : (
            <>
              <div className="border-y border-[var(--color-border)] px-1 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text)]">원격 저장소 작업 권한 <span className="font-normal text-[var(--color-text-dim)]">· 선택</span></div>
                    <div className="mt-0.5 text-xs leading-5 text-[var(--color-text-muted)]">위 프로젝트 연결은 Git의 remote에서 자동으로 읽습니다. 아래 권한은 Sugo가 원격 서비스의 PR을 직접 조회하거나 만들 때만 설정합니다. AWS·APM 운영 정보 연결과도 별개입니다.</div>
                  </div>
                  <span className="shrink-0 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-text-muted)]">{connections.length > 0 ? `${connections.length}개 권한 설정` : "설정 안 함"}</span>
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
                      <button type="button" disabled={busy} onClick={() => void handleDisconnect(connection.provider)} className="settings-action settings-action-danger settings-action-compact">연결 해제</button>
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
                        <span className="text-[10px] text-[var(--color-text-muted)]">{planned ? "지원 예정" : connected ? "작업 권한 있음" : repositorySummary.providerCounts[provider.label] ? `${repositorySummary.providerCounts[provider.label]}개 프로젝트 감지` : "설정 가능"}</span>
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
                  <div className="text-sm font-semibold text-[var(--color-text-bright)]">{provider.label} 작업 권한 설정</div>
              {usesAwsCredentials ? <>
                <div className="rounded-md border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Dashboard 서버의 AWS SDK 기본 자격 증명 체인을 사용합니다. 로컬에서는 AWS CLI/SSO 로그인을 먼저 완료하세요.
                </div>
                <label className="block text-sm text-[var(--color-text)]">
                  AWS profile (선택)
                  <input type="text" placeholder="default" value={profile} onChange={(event) => setProfile(event.target.value)} className="settings-field mt-1.5 w-full" />
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
                  className="settings-field mt-1.5 w-full"
                />
              </label>
              <input
                type="text"
                placeholder={requiresBaseUrl ? "Base URL (필수)" : `Base URL (선택, 기본 ${provider.defaultBaseUrl})`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="settings-field w-full"
              />
              </>}
              <button
                type="button"
                disabled={busy || (!usesAwsCredentials && !token) || (requiresBaseUrl && !baseUrl)}
                onClick={() => void handleConnect()}
                className="settings-action settings-action-primary"
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
          ))}
        </div>
      </div>}
      </section>
    </div>
  );
}
