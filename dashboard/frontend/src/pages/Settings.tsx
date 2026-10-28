import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { getProjectIntegrations, registerProject, saveProjectIntegration, type IntegrationCandidate, type ProjectIntegration } from '../api/projectIntegrationsApi.js';
import { awsAccountMetaLabel, awsAccountOptionLabel, groupProjectsByWorkspace, hasIntegrationSelectionChanges, initialIntegrationSelection, integrationCandidateMatchLabel, integrationStatusLabel, isExactIntegrationCandidate, partitionIntegrationCandidates, summarizeSavedIntegrations } from "../lib/projectIntegrationPresentation.js";
import { getAwsGuardPolicy, saveAwsGuardPolicy, type AwsGuardPolicy } from "../api/awsGuardPolicyApi.js";
import { PageHeading } from "../components/PageHeading.js";
import { Activity, ArrowRight, Boxes, Check, ChevronDown, Cloud, FolderGit2, FolderOpen, GitBranch, HardDrive, Plus, Unlink, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspaces, type WorkspaceSummary } from "../hooks/useWorkspaces.js";
import { summarizeRepositoryConnections } from "../lib/integrationConnectionSummary.js";

const LOCAL_DEV = import.meta.env.VITE_LOCAL_DEV === "true";
const contextAutoRefreshDescription = "Console이 켜져 있으면 매일 이 PC 시간 기준 08:00에 자동으로 동기화합니다. 꺼져 있었다면 다음에 켜질 때 동기화하고, 언제든 직접 동기화할 수 있습니다.";

type IntegrationSectionId = "aws" | "pinpoint" | "projects" | "git";
type IntegrationViewId = IntegrationSectionId | "catalog" | "overview" | "registration" | "serviceMapping";
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

function AwsContextCard({ expanded, onToggle, focused = false, onConnectionChange }: { expanded: boolean; onToggle: () => void; focused?: boolean; onConnectionChange?: (connected: boolean) => void }) {
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
    <div className={`${expanded ? "border-b" : ""} border-[var(--color-border)] ${focused ? "integration-panel-header" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>AWS 연결</h2>
        </div>
        <div className="flex items-center gap-2">
        {status?.connected && <>
          <button type="button" disabled={busy} onClick={() => void refreshAll()} title={`${contextAutoRefreshDescription} 계정별 하루 ${status.refreshBudget?.dailyLimit ?? 4}회까지 실행할 수 있습니다.`} className="settings-action settings-action-secondary settings-action-compact">{busy ? "동기화 중…" : "AWS 전체 동기화"}</button>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-300">연결됨</span>
        </>}
        {!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}
        </div>
      </div>
    </div>
    {expanded && <div className={`space-y-5 ${focused ? "integration-panel-body" : "p-5"}`}>
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
            <label className="min-w-[14rem] flex-1"><span className="sr-only">AWS 계정</span>
              <select aria-label="AWS 계정" value={status.activeAccount ?? ""} disabled={busy} onChange={(event) => void select(event.target.value)} className="settings-field w-full">
                {status.accounts.map((account) => <option key={account.name} value={account.name}>{awsAccountOptionLabel(account)}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => setAdding(true)} className="settings-action settings-action-primary">계정 추가</button>
            <button type="button" disabled={busy} onClick={() => void refresh()} className="settings-action settings-action-secondary">새로고침</button>
            <button type="button" disabled={busy} onClick={() => void disconnect()} className="settings-action settings-action-danger">연결 해제</button>
          </div>
          {status.activeAccount && <div className="mt-2 font-mono text-[11px] text-[var(--color-text-dim)]">{awsAccountMetaLabel(status.accounts.find((account) => account.name === status.activeAccount)!)}</div>}
        </div>
        <details className="border-y border-white/[0.08]">
          <summary className="cursor-pointer py-4 text-sm font-semibold text-[var(--color-text)]">AWS 조회 정책</summary>
          <div className="pb-5"><AwsAccessPolicySettings /></div>
        </details>
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
  return <section aria-labelledby="aws-access-policy">
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
  const [status, setStatus] = useState<PinpointStatus | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() { try { const next = await getPinpointContext(); setStatus(next); onConnectionChange?.(next.connected); if (next.baseUrl) setBaseUrl(next.baseUrl); setError(null); } catch (err) { setError(String(err)); } }
  useEffect(() => { void load(); }, []);
  async function run(action: () => Promise<unknown>) { setBusy(true); try { await action(); await load(); } catch (err) { setError(String(err)); } finally { setBusy(false); } }
  return <div id="integration-pinpoint" className="scroll-mt-24 overflow-hidden">
    <div className={`${expanded ? "border-b" : ""} border-[var(--color-border)] ${focused ? "integration-panel-header" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div><h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>Pinpoint APM</h2><p className={`${focused ? "mt-1 text-sm" : "text-xs"} text-[var(--color-text-muted)]`}>애플리케이션의 실제 실행 상태와 성능 지표를 읽습니다.</p></div>
        <div className="flex items-center gap-2">{status?.connected && <><button disabled={busy} onClick={() => void run(refreshPinpointContext)} title={contextAutoRefreshDescription} className="settings-action settings-action-secondary settings-action-compact">{busy ? "동기화 중…" : "Pinpoint 동기화"}</button><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-300">연결됨</span></>}{!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}</div>
      </div>
    </div>
    {expanded && <div className={`space-y-5 ${focused ? "integration-panel-body" : "p-5"}`}>
      {error && <div className="rounded border border-rose-500/30 px-3 py-2 text-xs text-rose-300">{error}</div>}
      <div className="flex gap-2"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://pinpoint.example.com" className="settings-field min-w-0 flex-1" />
        {!status?.connected ? <button disabled={busy || !baseUrl} onClick={() => void run(() => connectPinpointContext(baseUrl))} className="settings-action settings-action-primary">연결</button> : <button disabled={busy} onClick={() => void run(disconnectPinpointContext)} className="settings-action settings-action-danger">연결 해제</button>}
      </div>
      {status?.connected && <div><div className="mb-3"><strong className="text-sm text-[var(--color-text)]">수집 중인 애플리케이션</strong><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">실행 상태와 최근 5분 성능 표본을 요약합니다.</p></div><div className="divide-y divide-white/[0.07] border-y border-white/[0.08]">{status.applications.map((app) => <div key={app.applicationName} className="grid gap-2 px-1 py-4 text-xs sm:grid-cols-[minmax(0,1fr)_8rem_14rem] sm:items-center"><div className="font-medium text-[var(--color-text)]">{app.applicationName}</div><div className={app.state === "running" ? "text-emerald-300" : "text-[var(--color-text-muted)]"}>{app.state} · agent {app.runningAgentCount}/{app.agentCount}</div><div className="text-right text-[var(--color-text-muted)]">표본 {app.sampleCount >= 5000 ? '5,000+' : app.sampleCount} · 오류 {app.errorCount}</div></div>)}</div></div>}
      <p className="text-[11px] text-[var(--color-text-dim)]">읽기 전용 · 5분 중복 호출 방지</p>
    </div>}
  </div>;
}

function ProjectIntegrationsCard({ expanded, onToggle, focused = false, workspaceNames, startRegistering = false, registrationOnly = false, statusOnly = false }: { expanded: boolean; onToggle: () => void; focused?: boolean; workspaceNames: string[]; startRegistering?: boolean; registrationOnly?: boolean; statusOnly?: boolean }) {
  const [projects, setProjects] = useState<ProjectIntegration[]>([]); const [candidates, setCandidates] = useState<IntegrationCandidate[]>([]);
  const [path, setPath] = useState(''); const [selected, setSelected] = useState<string[]>([]); const [filter, setFilter] = useState(''); const [busy, setBusy] = useState(false); const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [registering, setRegistering] = useState(startRegistering || registrationOnly); const [registrationPath, setRegistrationPath] = useState(''); const [domainMode, setDomainMode] = useState<'existing' | 'new'>(workspaceNames.length > 0 ? 'existing' : 'new'); const [registrationWorkspace, setRegistrationWorkspace] = useState(workspaceNames[0] ?? ''); const [newWorkspace, setNewWorkspace] = useState(''); const [registrationError, setRegistrationError] = useState<string | null>(null);
  const key = (item: { accountName: string; service: string; cluster?: string | null }) => `${item.accountName}\u0000${item.cluster ?? ''}\u0000${item.service}`;
  async function load(nextPath?: string) { const data = await getProjectIntegrations(); setProjects(data.projects); setCandidates(data.candidates); const target = nextPath || path || data.projects[0]?.project_path || ''; const targetProject = data.projects.find((item) => item.project_path === target); setPath(target); setSelected(initialIntegrationSelection(targetProject, data.candidates, key)); }
  useEffect(() => { void load(); }, []);
  const project = projects.find((item) => item.project_path === path);
  const hasChanges = hasIntegrationSelectionChanges(project?.selections ?? [], selected, key);
  const savedKeys = new Set((project?.selections ?? []).map(key));
  const isSuggested = (item: IntegrationCandidate) => isExactIntegrationCandidate(path, item);
  const suggestionCount = candidates.filter(isSuggested).length;
  const partitioned = partitionIntegrationCandidates(candidates, selected, key);
  const filterCandidate = (item: IntegrationCandidate) => `${item.accountName} ${item.service} ${item.cluster ?? ''} ${item.pinpointApplicationName ?? ''}`.toLowerCase().includes(filter.toLowerCase());
  const sortCandidates = (items: IntegrationCandidate[]) => items.filter(filterCandidate).sort((left, right) => Number(isSuggested(right)) - Number(isSuggested(left)) || left.environment.localeCompare(right.environment) || left.service.localeCompare(right.service));
  const available = sortCandidates(partitioned.available);
  const applied = sortCandidates(partitioned.applied);
  const savedCandidates = candidates.filter((item) => savedKeys.has(key(item)));
  const pendingCandidates = applied.filter((item) => !savedKeys.has(key(item)));
  const registrationProjectName = registrationPath.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? '프로젝트';
  const registrationDomain = domainMode === 'new' ? newWorkspace.trim() : registrationWorkspace;
  const projectsByWorkspace = groupProjectsByWorkspace(projects);
  const toggleSelection = (value: string) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  async function submitRegistration() { const workspace = domainMode === 'new' ? newWorkspace.trim() : registrationWorkspace; if (!registrationPath.trim() || !workspace) return; setBusy(true); setRegistrationError(null); try { const result = await registerProject(registrationPath.trim(), workspace); await load(result.projectPath); if (!registrationOnly) setRegistering(false); setRegistrationPath(''); setSaveMessage(`${result.projectName} 프로젝트를 ${result.workspace} 도메인에 등록했습니다.`); } catch (error) { setRegistrationError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }
  async function save(disable = false) { if (!path) return; setBusy(true); setSaveMessage(null); try { const values = disable ? [] : candidates.filter((item) => selected.includes(key(item))).map(({ accountName, service, environment, cluster }) => ({ accountName, service, environment, cluster })); await saveProjectIntegration(path, values); await load(path); setSaveMessage(disable ? "이 프로젝트의 서비스 연동을 미사용으로 변경했습니다." : `${values.length}개 운영 서비스를 연결했습니다.`); } finally { setBusy(false); } }
  return <div id="integration-projects" className="scroll-mt-24 overflow-hidden">
    <div className={`${expanded ? "border-b" : ""} flex items-center justify-between gap-3 border-[var(--color-border)] ${focused ? "integration-panel-header" : "px-5 py-4"}`}><div><h2 className={`${focused ? "text-xl" : "text-base"} font-semibold text-[var(--color-text)]`}>{registrationOnly ? "프로젝트 등록" : statusOnly ? "서비스 상태" : "서비스 매핑"}</h2>{!registrationOnly && <p className={`${focused ? "mt-1 text-sm" : "text-xs"} text-[var(--color-text-muted)]`}>{statusOnly ? `저장된 ECS 연결을 기준으로 등록 프로젝트 ${projects.length}개의 서비스 상태를 보여줍니다.` : "프로젝트에서 사용할 ECS 서비스를 선택하고 저장합니다."}</p>}</div>{!focused && <DetailToggle expanded={expanded} onClick={onToggle} />}</div>
    {expanded && <div className={`space-y-5 ${focused ? "integration-panel-body" : "p-5"}`}>
      {registering && <section aria-label="새 프로젝트 등록" className="overflow-hidden border-y border-cyan-300/20 bg-[linear-gradient(120deg,rgba(34,211,238,0.055),rgba(15,23,42,0.14)_45%,transparent)]">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-6 py-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center border border-cyan-300/20 bg-cyan-300/[0.055] text-cyan-200"><FolderOpen size={18} /></span><div><strong className="text-base text-[var(--color-text)]">로컬 프로젝트 등록</strong><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">프로젝트 폴더와 작업 도메인만 선택하면 됩니다.</p></div></div>{!registrationOnly && <button type="button" onClick={() => setRegistering(false)} aria-label="등록 폼 닫기" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={17} /></button>}</div>
        <div className="bg-[var(--color-background)]/95 px-6 py-6">
          <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-cyan-300">01 · PROJECT FOLDER</span>
          <label htmlFor="registration-project-path" className="mb-2 mt-3 block text-sm font-semibold text-[var(--color-text)]">프로젝트 폴더</label>
          <input id="registration-project-path" value={registrationPath} onChange={(event) => setRegistrationPath(event.target.value)} placeholder="절대경로를 입력하세요" className="settings-field h-12 w-full border-cyan-300/25 bg-black/30 font-mono hover:border-cyan-300/45 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.10)]" />
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-cyan-300">02 · WORK DOMAIN</span><span className="text-[11px] text-[var(--color-text-muted)]">이 프로젝트가 속할 작업 영역</span></div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.09] bg-black/20 p-1 sm:w-[24rem]">
            <button type="button" aria-pressed={domainMode === 'existing'} disabled={workspaceNames.length === 0} onClick={() => setDomainMode('existing')} className={`h-10 rounded-md px-4 text-xs font-semibold transition ${domainMode === 'existing' ? 'bg-cyan-300/10 text-cyan-100' : 'text-[var(--color-text-muted)] hover:bg-white/[0.035] hover:text-[var(--color-text)]'}`}>기존 도메인</button>
            <button type="button" aria-pressed={domainMode === 'new'} onClick={() => setDomainMode('new')} className={`h-10 rounded-md px-4 text-xs font-semibold transition ${domainMode === 'new' ? 'bg-cyan-300/10 text-cyan-100' : 'text-[var(--color-text-muted)] hover:bg-white/[0.035] hover:text-[var(--color-text)]'}`}>새 도메인 만들기</button>
          </div>
          {domainMode === 'existing' ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{workspaceNames.map((name) => { const domainProjects = projectsByWorkspace.get(name) ?? []; const active = registrationWorkspace === name; return <button key={name} type="button" aria-pressed={active} onClick={() => setRegistrationWorkspace(name)} className={`min-h-16 rounded-lg border px-4 py-3 text-left transition ${active ? 'border-cyan-300/60 bg-cyan-300/[0.08] text-cyan-50 shadow-[inset_3px_0_0_rgba(103,232,249,0.9)]' : 'border-white/[0.09] bg-black/15 text-[var(--color-text-muted)] hover:border-white/[0.16] hover:text-[var(--color-text)]'}`}><strong className="block text-sm">{name}</strong><span className={`mt-2 block text-[11px] leading-5 ${active ? 'text-cyan-100/70' : 'text-[var(--color-text-dim)]'}`}>{active ? (domainProjects.length > 0 ? domainProjects.join(' · ') : '등록된 프로젝트 없음') : `${domainProjects.length}개 프로젝트`}</span></button>; })}</div> : <div className="mt-4 max-w-2xl"><label htmlFor="registration-new-domain" className="mb-2 block text-xs font-semibold text-[var(--color-text)]">새 도메인 이름</label><input id="registration-new-domain" value={newWorkspace} onChange={(event) => setNewWorkspace(event.target.value)} placeholder="예: recommendation-platform" className="settings-field h-12 w-full border-cyan-300/25 bg-black/30 hover:border-cyan-300/45" /><p className="mt-2 text-[11px] text-[var(--color-text-dim)]">프로젝트들을 같은 업무 영역으로 묶을 이름을 입력하세요.</p></div>}
        </div>
        {registrationError && <p role="alert" className="mx-6 mt-3 text-xs text-rose-300">{registrationError}</p>}
        <div className="mx-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] py-5"><p className="text-xs text-[var(--color-text-muted)]">등록 예정 · <strong className="font-mono font-semibold text-[var(--color-text)]">{registrationProjectName}</strong><span className="mx-2 text-[var(--color-text-dim)]">→</span><strong className="font-mono font-semibold text-cyan-200">{registrationDomain || '도메인 선택'}</strong></p><div className="flex gap-2">{!registrationOnly && <button type="button" onClick={() => setRegistering(false)} className="settings-action settings-action-secondary">취소</button>}<button type="button" disabled={busy || !registrationPath.trim() || !registrationDomain} onClick={() => void submitRegistration()} className="settings-action settings-action-primary">{busy ? '등록 중…' : '프로젝트 등록'}</button></div></div>
      </section>}
      {registrationOnly && saveMessage && <div role="status" className="border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-xs font-semibold text-emerald-200">✓ {saveMessage}</div>}
      {!registrationOnly && statusOnly && (projects.length === 0 ? <div className="py-8 text-center text-xs text-[var(--color-text-dim)]">등록된 프로젝트가 없습니다.</div> : <div className="divide-y divide-white/[0.07] border-y border-white/[0.08]">{projects.map((item) => { const summary = summarizeSavedIntegrations(item.selections); return <div key={item.project_path} className="grid gap-3 px-1 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] sm:items-center"><div><strong className="font-mono text-sm text-[var(--color-text)]">{item.workspace_name} / {item.project_path.split('/').at(-1)}</strong><span className="mt-1 block text-[11px] text-[var(--color-text-dim)]">{integrationStatusLabel(item)}</span></div><div className="flex flex-wrap gap-2">{summary.flatMap((group) => group.services.map((service) => <span key={`${group.environment}-${service}`} className="border border-emerald-300/15 bg-emerald-300/[0.025] px-2.5 py-1.5 text-[11px] text-[var(--color-text)]"><b className="mr-1.5 font-mono text-emerald-300">{group.environment}</b>{service}</span>))}{summary.length === 0 && <span className="text-xs text-[var(--color-text-muted)]">{item.configured ? '서비스 연동 미사용' : '서비스 매핑 필요'}</span>}</div></div>})}</div>)}
      {!registrationOnly && !statusOnly && <>
      {!registrationOnly && !statusOnly && (projects.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-5"><p className="text-xs text-[var(--color-text-dim)]">아직 등록된 프로젝트가 없습니다. 위 등록 폼이나 <code className="font-mono text-[11px] text-cyan-200">/sugo:add</code> 중 편한 방법을 사용할 수 있습니다.</p><button type="button" onClick={() => setRegistering(true)} className="settings-action settings-action-primary">프로젝트 등록</button></div> : <>
        <section aria-label="프로젝트 선택" className="border-y border-white/[0.07] py-5"><div className="mb-3 flex items-center gap-3"><span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-cyan-300">01</span><strong className="text-sm text-[var(--color-text)]">프로젝트 선택</strong></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{projects.map((item) => <button key={item.project_path} type="button" aria-pressed={path === item.project_path} onClick={() => { setPath(item.project_path); setSelected(initialIntegrationSelection(item, candidates, key)); setSaveMessage(null); }} className={`min-w-0 border px-4 py-3 text-left transition ${path === item.project_path ? 'border-cyan-300/55 bg-cyan-300/[0.07] shadow-[inset_3px_0_0_rgba(103,232,249,0.9)]' : 'border-white/[0.08] bg-black/10 hover:border-white/[0.16] hover:bg-white/[0.025]'}`}><strong className="block truncate font-mono text-sm text-[var(--color-text)]">{item.project_path.split('/').at(-1)}</strong><span className="mt-1 block truncate text-[11px] text-[var(--color-text-muted)]">{item.workspace_name} · {integrationStatusLabel(item)}</span></button>)}</div></section>
        {saveMessage && <div role="status" className="border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-xs font-semibold text-emerald-200">✓ {saveMessage}</div>}
        {project && project.configured && project.selections.length > 0 ? <section aria-label="현재 연결된 운영 서비스" className="border-y border-emerald-300/20 bg-emerald-300/[0.025] px-4 py-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-emerald-300">02</span><strong className="text-sm text-emerald-200">현재 연결</strong></div><span className="font-mono text-xs text-emerald-300">{project.selections.length}개</span></div><div className="mt-3 flex flex-wrap gap-2">{savedCandidates.map((item) => { const removed = !selected.includes(key(item)); return <button type="button" key={key(item)} onClick={() => { toggleSelection(key(item)); setSaveMessage(null); }} className={`group inline-flex items-center gap-2 border px-2.5 py-1.5 text-[11px] transition ${removed ? 'border-amber-300/20 text-amber-100 line-through opacity-60' : 'border-emerald-300/15 bg-black/15 text-[var(--color-text)] hover:border-rose-300/25'}`} title={removed ? '연결 유지' : '이 연결 해제'}><b className="font-mono text-emerald-300">{item.environment.toUpperCase()}</b>{item.service}{removed ? <span className="no-underline">해제 예정</span> : <X size={12} className="text-[var(--color-text-dim)] group-hover:text-rose-300" />}</button>; })}</div></section> : project && <div className={project.configured ? "border-y border-white/[0.08] bg-white/[0.018] px-4 py-3 text-xs text-[var(--color-text-muted)]" : "border-y border-amber-400/20 bg-amber-400/[0.035] px-4 py-3 text-xs text-amber-100"}>{project.configured ? "서비스 연동 미사용으로 설정된 프로젝트입니다." : `아직 저장된 연결이 없습니다. 일치 후보 ${suggestionCount}개는 저장 전까지 적용되지 않습니다.`}</div>}
        {pendingCandidates.length > 0 && <section aria-label="추가 예정 서비스" className="border-y border-cyan-300/15 bg-cyan-300/[0.025] px-4 py-3"><div className="flex items-center justify-between gap-3"><strong className="text-xs text-cyan-100">추가 예정</strong><span className="font-mono text-[11px] text-cyan-300">{pendingCandidates.length}개</span></div><div className="mt-2 flex flex-wrap gap-2">{pendingCandidates.map((item) => <button type="button" key={key(item)} onClick={() => toggleSelection(key(item))} className="inline-flex items-center gap-2 border border-cyan-300/15 px-2.5 py-1.5 text-[11px] text-[var(--color-text)]"><b className="font-mono text-cyan-200">{item.environment.toUpperCase()}</b>{item.service}<X size={12} className="text-[var(--color-text-dim)]" /></button>)}</div></section>}
        <div className="flex items-center justify-between gap-4 pt-2"><div><div className="flex items-center gap-3"><span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-cyan-300">03</span><strong className="text-sm text-[var(--color-text)]">ECS 서비스 추가</strong><span className="font-mono text-xs text-[var(--color-text-dim)]">{available.length}개</span></div><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">서비스 ID와 클러스터를 저장해 정확히 연결합니다.</p></div><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="계정, 서비스, 환경 검색" className="settings-field w-64 max-w-[50%]" /></div>
        <div className="ck-scroll max-h-80 divide-y divide-white/[0.06] overflow-auto border-y border-white/[0.07]">
          {available.length === 0 && <div className="px-3 py-10 text-center text-xs text-[var(--color-text-dim)]">추가로 연결할 서비스를 찾지 못했습니다.</div>}
          {available.map((item) => { const itemKey = key(item); const exact = isSuggested(item); return <div key={itemKey} className="flex items-center gap-4 px-3 py-3.5 transition hover:bg-white/[0.025]"><span className="min-w-0 flex-1"><span className="text-sm text-[var(--color-text)]"><b className="text-cyan-200">{item.environment.toUpperCase()}</b> {item.service}</span><span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-dim)]">{item.accountName} / {item.cluster ?? 'cluster 미확인'}{item.pinpointApplicationName ? ` / Pinpoint ${item.pinpointApplicationName}` : ''}</span></span><span className={`border px-2 py-1 text-[11px] ${exact ? 'border-amber-400/20 text-amber-200' : 'border-white/[0.08] text-[var(--color-text-dim)]'}`}>{integrationCandidateMatchLabel(path, item)}</span><button type="button" onClick={() => { toggleSelection(itemKey); setSaveMessage(null); }} className="settings-action settings-action-secondary settings-action-compact gap-1.5"><Plus size={13} />추가</button></div>; })}
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 transition ${hasChanges ? 'border-amber-300/25 bg-amber-300/[0.035]' : 'border-white/[0.07]'}`}><p className={`text-[11px] ${hasChanges ? 'font-semibold text-amber-100' : 'text-[var(--color-text-dim)]'}`}>{hasChanges ? '저장하지 않은 변경이 있습니다. 저장해야 실제 연결에 반영됩니다.' : '저장된 연결과 현재 선택이 같습니다.'}</p><div className="flex gap-2"><button disabled={busy || selected.length === 0 || !hasChanges} onClick={() => void save()} className="settings-action settings-action-primary">{busy ? '저장 중…' : '변경 내용 저장'}</button><button disabled={busy || (project?.configured && project.selections.length === 0)} onClick={() => void save(true)} className="settings-action settings-action-secondary gap-1.5"><Unlink size={13} />서비스 연동 미사용</button></div></div>
      </>)}
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

function ConnectionJourney({ projectCount, remoteCount, permissionCount, awsConnected, pinpointConnected, onOpenGit }: {
  projectCount: number;
  remoteCount: number;
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
      <li className={`flex min-h-20 items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 lg:border-b-0 lg:border-r ${remoteCount === 0 ? "bg-cyan-300/[0.055]" : ""}`}><span className="font-mono text-xs text-cyan-300">02</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--color-text)]">코드 저장소</strong><small className="mt-1 block text-[11px] text-[var(--color-text-muted)]">{remoteCount > 0 ? "Git remote를 감지했습니다" : "감지된 Git remote 없음"}</small></span><button type="button" onClick={onOpenGit} className="text-cyan-200" aria-label="코드 저장소 현황 열기"><ArrowRight size={16} /></button></li>
      <li className="flex min-h-20 items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:border-r lg:border-b-0"><span className="font-mono text-xs text-violet-300">03</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--color-text)]">PR API 권한</strong><small className="mt-1 block text-[11px] text-[var(--color-text-muted)]">브랜치 확인·PR 조회·생성 · {permissionCount > 0 ? `${permissionCount}개 설정` : "미설정"}</small></span></li>
      <li className="flex min-h-20 items-center gap-3 px-5 py-4"><span className="font-mono text-xs text-amber-300">04</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--color-text)]">서비스 상태 · 모니터링</strong><small className="mt-1 block text-[11px] text-[var(--color-text-muted)]">선택 기능 · {operationalCount > 0 ? "연결됨" : "미연결"}</small></span></li>
    </ol>
  </section>;
}

function ProjectGitConnections({ workspaces }: { workspaces: WorkspaceSummary[] | null }) {
  const projects = Array.from(new Map((workspaces ?? []).flatMap((workspace) => workspace.projects).map((project) => [project.project_path, project])).values());
  if (projects.length === 0) return <div className="border-y border-[var(--color-border)] px-1 py-5 text-sm text-[var(--color-text-muted)]">등록된 로컬 프로젝트가 없습니다.</div>;
  return <section aria-label="프로젝트별 저장소 연결" className="border-y border-[var(--color-border)]">
    <div className="flex items-end justify-between gap-3 border-b border-[var(--color-border)] px-1 py-4"><strong className="text-sm text-[var(--color-text)]">프로젝트별 연결</strong><span className="text-[10px] text-[var(--color-text-dim)]">{projects.length}개 프로젝트</span></div>
    <div className="divide-y divide-white/[0.07]">
      {projects.map((project) => { const confirmedOperations = project.aws_deployments.filter((item) => item.linkMode === "confirmed").length; const suggestedOperations = project.aws_deployments.filter((item) => item.linkMode === "suggested").length; return <div key={project.project_path} className="grid gap-4 px-1 py-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(8rem,.55fr)_minmax(11rem,.8fr)_minmax(10rem,.7fr)] sm:items-center">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center bg-cyan-300/[0.06] text-cyan-300"><FolderGit2 size={16} /></span><span className="min-w-0"><strong className="block truncate font-mono text-sm text-[var(--color-text)]">{project.project_path.split(/[\\/]/).filter(Boolean).pop()}</strong><small className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-dim)]">{project.project_path}</small></span></div>
        <div><small className="block text-[10px] text-[var(--color-text-dim)]">코드 이력</small><span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-text)]"><HardDrive size={13} className="text-[var(--color-text-muted)]" />{project.local_git.headCommit ? "로컬 Git 사용 중" : "Git 확인 안 됨"}</span></div>
        <div><small className="block text-[10px] text-[var(--color-text-dim)]">원격 저장소</small>{project.remote_git ? <><span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><Cloud size={13} />{project.remote_git.providerLabel}</span><span className="mt-1 block truncate font-mono text-[10px] text-emerald-200/80">{project.remote_git.repository}</span></> : <span className="mt-1 block text-xs text-[var(--color-text-muted)]">연결된 origin 없음</span>}</div>
        <div><small className="block text-[10px] text-[var(--color-text-dim)]">운영 정보</small>{confirmedOperations > 0 ? <span className="mt-1 block text-xs font-semibold text-emerald-300">ECS/APM {confirmedOperations}개 연결됨</span> : suggestedOperations > 0 ? <span className="mt-1 block text-xs text-amber-200">후보 {suggestedOperations}개 · 저장 필요</span> : <span className="mt-1 block text-xs text-[var(--color-text-muted)]">연결 없음</span>}</div>
      </div>})}
    </div>
  </section>;
}

export function Settings() {
  const [searchParams] = useSearchParams();
  const [selectedSection, setSelectedSection] = useState<IntegrationViewId>("registration");
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

  useEffect(() => {
    if (searchParams.get('section') === 'projects') setSelectedSection(searchParams.get('register') === '1' ? 'registration' : 'projects');
  }, [searchParams]);

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
    if (selectedSection === "git") setSelected("github");
  }, [selectedSection]);

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
  const activeGroup = selectedSection === "registration"
    ? "projects"
    : selectedSection === "overview"
      ? "status"
      : "services";
  const visibleProviders = providers?.filter((provider) => provider.id === "github" || provider.id === "aws_codecommit") ?? null;
  const visibleConnections = connections.filter((connection) => connection.provider === "github" || connection.provider === "aws_codecommit");

  return (
    <div className="settings-interface mx-auto max-w-6xl space-y-6">
      <PageHeading eyebrow="SYSTEM INTEGRATIONS" title="외부 연동" description="저장소와 운영 환경을 연결하고, Sugo가 사용할 외부 서비스의 범위를 관리합니다." />

      <nav aria-label="외부 연동 단계" className="grid border-y border-[var(--color-border)] md:grid-cols-3">
        {[
          { id: "projects", number: "01", label: "프로젝트", description: "로컬 프로젝트 등록", target: "registration" as const },
          { id: "services", number: "02", label: "외부 서비스", description: "인증·서비스 매핑", target: "git" as const },
          { id: "status", number: "03", label: "연결 현황", description: "읽기 전용 결과", target: "overview" as const },
        ].map((item) => <button key={item.id} type="button" aria-pressed={activeGroup === item.id} onClick={() => setSelectedSection(item.target)} className={`grid min-h-20 grid-cols-[2rem_1fr] border-b border-[var(--color-border)] px-5 py-4 text-left transition md:border-b-0 md:border-r ${activeGroup === item.id ? "bg-cyan-300/[0.055] shadow-[inset_0_-2px_var(--color-primary)]" : "hover:bg-white/[0.02]"}`}><span className="row-span-2 font-mono text-xs text-cyan-300">{item.number}</span><strong className="text-sm text-[var(--color-text)]">{item.label}</strong><small className="mt-1 text-[11px] text-[var(--color-text-dim)]">{item.description}</small></button>)}
      </nav>

      {activeGroup === "services" && <nav aria-label="외부 서비스 설정" className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-2">
        {[{ id: "git" as const, label: "PR 작업" }, { id: "serviceMapping" as const, label: "서비스 상태" }, { id: "pinpoint" as const, label: "모니터링" }].map((item) => <button key={item.id} type="button" aria-pressed={selectedSection === item.id} onClick={() => setSelectedSection(item.id)} className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${selectedSection === item.id ? "border-cyan-300 text-cyan-100" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>{item.label}</button>)}
      </nav>}

      {!LOCAL_DEV && <ApiTokensCard />}

      <section className="integration-workbench overflow-hidden border-y border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(15,23,42,0.78),rgba(6,12,22,0.9))] shadow-[0_20px_70px_rgba(0,0,0,0.12)]">
      {selectedSection === "catalog" && <IntegrationCatalog awsConnected={awsConnected} pinpointConnected={pinpointConnected} onSelect={setSelectedSection} />}
      {selectedSection === "pinpoint" && <PinpointContextCard expanded onToggle={() => undefined} focused onConnectionChange={setPinpointConnected} />}
      {selectedSection === "registration" && <ProjectIntegrationsCard expanded onToggle={() => undefined} focused workspaceNames={(workspaces ?? []).map((workspace) => workspace.name)} registrationOnly />}
      {selectedSection === "serviceMapping" && <><AwsContextCard expanded onToggle={() => undefined} focused onConnectionChange={setAwsConnected} /><ProjectIntegrationsCard expanded onToggle={() => undefined} focused workspaceNames={(workspaces ?? []).map((workspace) => workspace.name)} /></>}

      {(selectedSection === "overview" || selectedSection === "git") && <div id="integration-git" className="scroll-mt-24 overflow-hidden">
        <div className="integration-panel-header flex items-center justify-between gap-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300/20 text-[var(--color-primary)]"><GitBranch size={17} /></span>
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">{selectedSection === "overview" ? "프로젝트 연결 현황" : "PR 작업"}</h2>
            {selectedSection === "git" && <p className="mt-1 text-sm text-[var(--color-text-muted)]">브랜치 확인과 PR 조회·생성 권한을 설정합니다.</p>}
          </div>
          </div>
        </div>

        <div className="integration-panel-body space-y-5">
          {selectedSection === "overview" && <ProjectGitConnections workspaces={workspaces} />}
          {selectedSection === "git" && <>
          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}
          </>}

          {selectedSection === "git" && (visibleProviders === null ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
              불러오는 중…
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleProviders.map((provider) => {
                  const detectedProjects = repositorySummary.providerProjects[provider.id] ?? [];
                  const connected = connections.some((item) => item.provider === provider.id);
                  return <button key={provider.id} type="button" aria-pressed={selected === provider.id} onClick={() => { setSelected(provider.id); setBaseUrl(provider.defaultBaseUrl ?? ""); }} className={`border px-4 py-3 text-left transition ${selected === provider.id ? "border-cyan-300/45 bg-cyan-300/[0.06]" : "border-white/[0.08] hover:border-white/[0.16]"}`}><span className="flex items-center justify-between gap-3"><strong className="text-sm text-[var(--color-text)]">{provider.label}</strong><span className={`text-[10px] font-semibold ${connected ? "text-emerald-300" : "text-[var(--color-text-muted)]"}`}>{connected ? "권한 설정됨" : "권한 설정"}</span></span><span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">{provider.authMode === "aws_default_chain" ? "AWS CLI·SSO 인증 사용 · 토큰 없음" : "PR API용 액세스 토큰 필요"} · {detectedProjects.length}개 프로젝트</span></button>;
                })}
              </div>
              <div className="border-y border-[var(--color-border)] px-1 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text)]">{selected === "aws_codecommit" ? "AWS 자격 증명으로 PR 권한 연결" : "GitHub 액세스 토큰으로 PR 권한 연결"}</div>
                    <div className="mt-0.5 text-xs leading-5 text-[var(--color-text-muted)]">Sugo가 브랜치를 확인하고 PR을 조회·생성할 때만 사용합니다. commit·push는 로컬 Git 인증을 그대로 사용합니다.</div>
                  </div>
                  <span className="shrink-0 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-text-muted)]">{visibleConnections.length > 0 ? "PR API 사용 중" : "PR API 미설정"}</span>
                </div>
              </div>

              {visibleConnections.map((connection) => {
                const provider = visibleProviders.find((item) => item.id === connection.provider);
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

              {selected && visibleProviders.some((provider) => provider.id === selected) && (() => {
                const provider = visibleProviders.find((item) => item.id === selected)!;
                const requiresBaseUrl = provider.id === "bitbucket_server";
                const usesAwsCredentials = provider.authMode === "aws_default_chain";
                const detectedProjects = repositorySummary.providerProjects[provider.id] ?? [];
                return <div className="space-y-3 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.03] p-4">
              <div className="border-y border-white/[0.08] py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[var(--color-text)]">적용 프로젝트</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">{detectedProjects.length}개</span>
                </div>
                {detectedProjects.length > 0 ? <div className="space-y-2">
                  <div className="hidden grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-dim)] sm:grid">
                    <span>도메인</span><span>로컬 프로젝트</span><span>원격 저장소</span>
                  </div>
                  {detectedProjects.map((project) => <div key={project.projectPath} className="grid gap-1 text-xs sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                    <span className="truncate font-medium text-[var(--color-text)]">{project.workspaceName}</span>
                    <span className="truncate text-[var(--color-text-muted)]" title={project.projectPath}>{project.projectName}</span>
                    <span className="truncate font-mono text-[11px] font-medium text-sky-100" title={project.remoteUrl}>{project.repository}</span>
                  </div>)}
                </div> : <p className="text-xs leading-5 text-[var(--color-text-muted)]">이 공급자를 사용하는 Git remote가 등록 프로젝트에서 아직 감지되지 않았습니다.</p>}
              </div>
              {usesAwsCredentials ? <>
                <div className="rounded-md border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  <b className="text-amber-100">별도 토큰은 입력하지 않습니다.</b> AWS CLI 또는 SSO 로그인 정보를 사용하므로 별도 토큰은 필요하지 않습니다. 로그인하지 않았다면 먼저 터미널에서 인증을 완료하세요.
                </div>
                <label className="block text-sm text-[var(--color-text)]">
                  사용할 AWS profile <span className="text-[var(--color-text-dim)]">· 비우면 default</span>
                  <input type="text" placeholder="default" value={profile} onChange={(event) => setProfile(event.target.value)} className="settings-field mt-1.5 w-full" />
                </label>
              </> : <>
              <label className="block text-sm text-[var(--color-text)]">
                GitHub 액세스 토큰
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
                {usesAwsCredentials ? "AWS PR 권한 연결" : "PR 권한 연결"}
              </button>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                {usesAwsCredentials ? "Access key는 Dashboard에 저장하지 않습니다. 선택한 profile의 현재 로그인 상태를 AWS SDK가 사용합니다." : "토큰은 AES-256-GCM으로 암호화됩니다. 프로젝트 remote를 감지해 같은 공급자의 연결을 사용합니다."}
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
