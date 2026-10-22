import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bot,
  FolderOpen,
  Gauge,
  GitBranch,
  History,
  Info,
  LayoutGrid,
  Package,
  Plus,
  Rows3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  FileCode,
  Lightbulb,
  Search,
  Shield,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { WORKSPACE_CARD_FOCUS_CLASSES, getWorkspaceColor, workspaceCardEmphasis, workspaceCardShadow } from "../lib/workspaceSelection.js";
import { useWorkspaces, type WorkspaceSummary } from "../hooks/useWorkspaces.js";
import {
  useWorkspaceHistory,
  type HistoryLog,
} from "../hooks/useWorkspaceData.js";
import { LiveConsole } from "../components/LiveConsole.js";
import { Modal } from "../components/Modal.js";
import { LoadingSpinner, EmptyState } from "../components/StatusViews.js";
import { CheckpointPanel } from "../components/CheckpointPanel.js";
import { AgentCanvasOverlay } from "../components/AgentCanvasOverlay.js";
import { searchHistory, type HistorySearchResult } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { RoadmapTab } from "../components/roadmap/RoadmapTab.js";
import { useRoadmap } from "../hooks/useRoadmap.js";
import { compareRelease, shortCommit, type ReleaseComparison } from "../lib/awsReleasePresentation.js";
import { presentSteKorean } from "../lib/steKorean.js";
import { historyContextTitle, historyDisplayDate, historyDisplayTitle } from "../lib/historyPresentation.js";
import { workspacePulse } from "../lib/operationalPulse.js";
import { workspaceCommandSummary } from "../lib/experienceModel.js";
import { AI_WORK_STATUS_TOOL, WORKSPACE_RULES_TOOL } from "../lib/workspaceTools.js";

/** 상수 — 인스펙터는 10개씩 끊는다(200개여도 스크롤 지옥이 안 되게). */
const PAGE_SIZE = 10;
const APM_STATE = {
  OBSERVED: { label: "APM 관측", color: "text-emerald-300" },
  STALE: { label: "APM 지연", color: "text-amber-300" },
  MISSING: { label: "APM 미관측", color: "text-rose-300" },
  UNKNOWN: { label: "APM 확인 필요", color: "text-[var(--color-text-muted)]" },
} as const;

const INSPECTOR_TABS = [
  { id: "repositories" as const, label: "Repositories", icon: Package },
  { id: "history" as const, label: "History", icon: History },
];
type TabType = (typeof INSPECTOR_TABS)[number]["id"];

/** 로드맵 완료율. 노드가 하나도 없으면 **null**("모른다") — 0%로 그리면 거짓말이 된다. */
function healthOf(ws: WorkspaceSummary): number | null {
  if ((ws.roadmapCount ?? 0) === 0) return null;
  return Math.round(((ws.roadmapDoneCount ?? 0) / ws.roadmapCount) * 100);
}
function activeOf(ws: WorkspaceSummary): boolean {
  return (ws.activeTaskCount ?? 0) > 0;
}

/** statusOf — 진행 중이 최우선, 그 다음 100% 완료, 나머지는 IDLE. */
function statusOf(ws: WorkspaceSummary): { text: string; dot: string; pill: string; desc: string } {
  if (activeOf(ws)) {
    return {
      text: "IN PROGRESS",
      dot: "bg-amber-400",
      pill: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      desc: "IN PROGRESS — 캔버스에 진행 중인 task가 있음(AI 착수~사용자 완료 전)",
    };
  }
  if (healthOf(ws) === 100) {
    return {
      text: "COMPLETED",
      dot: "bg-emerald-400",
      pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      desc: "COMPLETED — 이 도메인 Agent Canvas의 모든 Task 100% 완료",
    };
  }
  return {
    text: "IDLE",
    dot: "bg-slate-500",
    pill: "border-slate-500/30 bg-slate-500/10 text-slate-400",
    desc: "IDLE — 진행 세션 없음 · 미완료 Task 남음(대기)",
  };
}

function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function formatDeploymentDate(taskDefinitionRegisteredAt: string | null, deploymentUpdatedAt: string | null): string {
  const effective = taskDefinitionRegisteredAt ?? deploymentUpdatedAt;
  if (!effective) return "배포 시각 확인 불가";
  const date = new Date(effective);
  if (Number.isNaN(date.getTime())) return "배포 시각 확인 불가";
  return `${taskDefinitionRegisteredAt ? "Task 정의" : "ECS 갱신"} ${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)}`;
}

const DEPLOYMENT_HEALTH = {
  HEALTHY: { label: "정상", color: "text-emerald-300" },
  DEPLOYING: { label: "배포 중", color: "text-cyan-300" },
  DEGRADED: { label: "비정상", color: "text-rose-300" },
  INACTIVE: { label: "비활성", color: "text-slate-400" },
  UNKNOWN: { label: "미확인", color: "text-amber-300" },
} as const;

const RELEASE_STATE: Record<ReleaseComparison, { label: string; color: string; description: string }> = {
  UNCOMMITTED: { label: "커밋 전 변경", color: "border-amber-400/30 bg-amber-400/10 text-amber-200", description: "로컬 작업트리에 아직 커밋하지 않은 변경이 있습니다." },
  COMMIT_NOT_BUILT: { label: "커밋 미빌드", color: "border-rose-400/30 bg-rose-400/10 text-rose-200", description: "로컬 HEAD와 최신 성공 빌드의 커밋이 다릅니다." },
  BUILT_NOT_DEPLOYED: { label: "빌드됨 · 미배포", color: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200", description: "현재 커밋은 빌드됐지만 한 개 이상의 환경이 최신 이미지가 아닙니다." },
  DEPLOYED: { label: "최신 배포 일치", color: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200", description: "로컬 HEAD, 최신 성공 빌드, 표시된 환경의 이미지가 일치합니다." },
  UNKNOWN: { label: "비교 불가", color: "border-slate-400/30 bg-slate-400/10 text-slate-300", description: "커밋·빌드·이미지 중 비교에 필요한 정보가 부족합니다." },
};

export function Sessions() {
  const { data, loading } = useWorkspaces();
  const navigate = useNavigate();

  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("repositories");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<"all" | "recent">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectorPage, setInspectorPage] = useState(0);
  const [expandedRepository, setExpandedRepository] = useState<string | null>(null);
  const [showStatusGuide, setShowStatusGuide] = useState(false);
  const [addCopied, setAddCopied] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryLog | null>(null);
  const [checkpointModal, setCheckpointModal] = useState<string | null>(null);
  const [agentCanvasModal, setAgentCanvasModal] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<HistorySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { userId } = useAuth();

  const history = useWorkspaceHistory(selectedWorkspace);

  const workspaces = useMemo(() => data ?? [], [data]);
  const pulse = useMemo(() => workspacePulse(workspaces), [workspaces]);
  const commandSummary = useMemo(() => workspaceCommandSummary(pulse), [pulse]);
  const isSearchMode = searchQuery.trim().length >= 2;
  const initialSelectionApplied = useRef(false);

  useEffect(() => {
    if (initialSelectionApplied.current || workspaces.length === 0) return;
    initialSelectionApplied.current = true;
    setSelectedWorkspace(workspaces[0].name);
  }, [workspaces]);

  useEffect(() => {
    setExpandedRepository(null);
  }, [selectedWorkspace, inspectorPage]);

  useEffect(() => {
    const closeGuideOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && showStatusGuide) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowStatusGuide(false);
      }
    };
    window.addEventListener("keydown", closeGuideOnEscape);
    return () => window.removeEventListener("keydown", closeGuideOnEscape);
  }, [showStatusGuide]);

  const filteredWorkspaces = useMemo(() => {
    let list = workspaces;
    if (statusFilter === "recent") {
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      list = list.filter((w) => w.lastActivityAt !== null && new Date(w.lastActivityAt).getTime() >= cutoff);
    }
    if (isSearchMode) {
      // 이건 **이력 검색**이다. 도메인 이름만 대조하면 "1건 일치"라고 배너에 써놓고 목록은
      // 비는, 스스로 모순되는 화면이 된다. 이름이 걸리거나 **이력이 걸린** 도메인을 남긴다.
      const q = searchQuery.trim().toLowerCase();
      const hit = new Set(searchResults.map((r) => r.workspace_name));
      list = list.filter((w) => hit.has(w.name) || w.name.toLowerCase().includes(q));
    }
    return list;
  }, [workspaces, statusFilter, searchQuery, isSearchMode, searchResults]);

  /** 검색 모드에서 이 도메인에 걸린 이력만. 인스펙터가 전체 이력 대신 이걸 보여준다. */
  const getSearchResultHistory = useCallback(
    (name: string) => searchResults.filter((r) => r.workspace_name === name),
    [searchResults],
  );

  // 디바운스 검색 — 2자 미만이면 결과를 비운다(한 글자에 전체 스캔을 돌리지 않는다).
  useEffect(() => {
    if (!isSearchMode || !userId) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const t = setTimeout(() => {
      searchHistory(searchQuery.trim(), userId)
        .then((rows) => {
          setSearchResults(rows);
          if (rows.length > 0) {
            setSelectedWorkspace(rows[0].workspace_name);
            setActiveTab("history");
          }
        })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, isSearchMode, userId]);

  // Agent Canvas 오버레이가 열려 있는 동안 배경 스크롤을 잠근다.
  useEffect(() => {
    if (!agentCanvasModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [agentCanvasModal]);

  const selected = filteredWorkspaces.find((w) => w.name === selectedWorkspace) ?? null;

  const copyAddDomain = () => {
    void navigator.clipboard?.writeText("/sugo:ws-add").catch(() => {});
    setAddCopied(true);
    setTimeout(() => setAddCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  const renderVitals = (ws: WorkspaceSummary) => {
    const health = healthOf(ws);
    const active = activeOf(ws);
    if (health === null && !active) return null;
    return (
      <div className="flex items-center gap-2">
        {health !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
              health >= 90
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : health >= 50
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300",
            )}
            title="로드맵 완료율(Health)"
          >
            <Gauge size={11} /> {health}% health
          </span>
        )}
        {active && (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-300"
            title="에이전트 실시간 작업 중(최근 로그 수신)"
          >
            <Activity size={11} /> active
          </span>
        )}
      </div>
    );
  };

  const renderCounts = (ws: WorkspaceSummary) => (
    <div className="flex items-center gap-3 text-sm">
      {(ws.roadmapCount ?? 0) > 0 && (
        <div className="flex items-center gap-1 text-emerald-400" title="Agent Canvas 진행">
          <GitBranch size={14} />
          <span>
            {ws.roadmapDoneCount ?? 0}/{ws.roadmapCount}
          </span>
        </div>
      )}
      {ws.historyCount > 0 && (
        <div className="flex items-center gap-1 text-violet-400" title="History">
          <History size={14} />
          <span>{ws.historyCount}</span>
        </div>
      )}
      {ws.checkpointCount > 0 && (
        <div className="flex items-center gap-1 text-amber-400" title="Checkpoints">
          <AlertTriangle size={14} />
          <span>{ws.checkpointCount}</span>
        </div>
      )}
    </div>
  );

  /**
   * `renderDetail(ws)` — 검색 결과 행을 그 자리에서 펼친 본문.
   * 프로젝트 칩 + 인스펙터(History/Repositories)를 그대로 쓴다. 탭 본문을 여기에 다시
   * 쓰면 두 벌이 되어 한쪽만 고쳐지는 일이 반드시 생긴다.
   */
  const renderDetail = (ws: WorkspaceSummary) => (
    <>
      {(ws.projects?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="mr-1 text-[12px] text-[var(--color-text-muted)]">프로젝트 {ws.projects!.length}</span>
          {ws.projects!.map((pr) => (
            <span
              key={pr.project_path}
              title={pr.project_path}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 font-mono text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-cyan-500/40 hover:text-[var(--color-text)]"
            >
              {repoName(pr.project_path)}
            </span>
          ))}
        </div>
      )}
      <div className="flex max-h-[320px] min-h-[140px] flex-col">{renderInspector(ws)}</div>
    </>
  );

  const renderInspector = (ws: WorkspaceSummary) => {
    // 검색 중에는 **걸린 이력만** 보여준다. 전체 이력을 그대로 띄우면 무엇이 검색에 걸렸는지
    // 사람이 다시 눈으로 찾아야 한다.
    // 검색 결과 행에는 key_decisions/files_changed가 없다(검색 API가 요약만 준다) — 칩은
    // 0으로 접히고, 상세는 모달을 열 때 전체 이력에서 다시 찾는다.
    const hist: { data: HistoryLog[]; loading: boolean } = isSearchMode
      ? {
          data: getSearchResultHistory(ws.name).map(
            (r) => ({ ...r, key_decisions: [], files_changed: [] }) as unknown as HistoryLog,
          ),
          loading: false,
        }
      : { data: history.data, loading: history.loading };
    const total = activeTab === "history" ? hist.data.length : (ws.projects?.length ?? 0);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(inspectorPage, pages - 1);
    const s = page * PAGE_SIZE;

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2.5">
          <div className="flex items-center gap-2">
            <FolderOpen size={15} className="text-cyan-300" />
            <span className="font-mono text-[13px] font-semibold text-[var(--color-text-bright)]">
              {ws.name} Inspector
            </span>
            <span className="font-mono text-[11px] text-[var(--color-text-dim)]">| {ws.projectCount} repos</span>
          </div>
          <div className="flex gap-1.5 font-mono text-xs">
            {INSPECTOR_TABS.map((t) => {
              const Icon = t.icon;
              const count = t.id === "history" ? hist.data.length : (ws.projects?.length ?? 0);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    setInspectorPage(0);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2.5 py-1 font-bold transition-all",
                    activeTab === t.id
                      ? "neon-border-cyan bg-cyan-500/20 text-cyan-300"
                      : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                  )}
                >
                  <Icon size={11} /> {t.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="ck-scroll mt-2 min-h-0 flex-1 overflow-auto pr-1">
          {activeTab === "repositories" ? (
            <div className="space-y-2">
              <ul className="space-y-1">
              {(ws.projects ?? []).slice(s, s + PAGE_SIZE).map((p) => {
                const serviceDeployments = [...new Set(p.aws_deployments.map((deployment) => deployment.service))]
                  .map((service) => ({ service, deployments: p.aws_deployments.filter((deployment) => deployment.service === service) }));
                const imageVersions = p.aws_deployments.map((deployment) => deployment.images[0]?.split(":").at(-1) ?? null);
                const releaseComparison = compareRelease(p.aws_release, p.local_git, imageVersions);
                const releaseState = RELEASE_STATE[releaseComparison];
                const isExpanded = expandedRepository === p.project_path;
                return (
                <li
                  key={p.project_path}
                  className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[13px]"
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedRepository(isExpanded ? null : p.project_path)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.025]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight size={14} className={cn("shrink-0 text-[var(--color-text-dim)] transition-transform", isExpanded && "rotate-90 text-cyan-300")} />
                      <span className="truncate font-mono text-sm font-semibold text-[var(--color-text-bright)]" title={p.project_path}>📦 {repoName(p.project_path)}</span>
                    </span>
                    <div className="flex shrink-0 gap-1.5">
                      {p.git_synced === 1 && <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">Git Synced</span>}
                      {p.aws_synced === 1 && <span className="rounded border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">{p.aws_deployments.some((deployment) => deployment.linkMode === 'confirmed') ? 'AWS Synced' : 'AWS Suggested'}</span>}
                    </div>
                  </button>
                  {isExpanded && <div className="border-t border-[var(--color-border)] px-3 pb-3">
                  {p.aws_release && <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-cyan-400/20 bg-cyan-400/[0.04] px-2.5 py-2 text-[11px] leading-5 text-[var(--color-text-muted)]">
                    <span>배포 기준 <b className="text-cyan-200">{p.aws_release.baseBranch}</b></span>
                    <span>로컬 <b className="text-[var(--color-text)]">{p.local_git.branch ?? "detached"}@{shortCommit(p.local_git.headCommit)}</b></span>
                    <span>최신 성공 Build <b className="text-purple-200">#{p.aws_release.latestBuildNumber ?? "?"}</b> · {shortCommit(p.aws_release.latestBuildCommit)}</span>
                    <span className={`ml-auto rounded border px-1.5 py-0.5 font-bold ${releaseState.color}`} title={releaseState.description}>{releaseState.label}</span>
                  </div>}
                  {serviceDeployments.map(({ service, deployments }) => <section key={service} className="mt-3 rounded-md border border-[var(--color-border)] bg-black/10 p-2.5">
                    <div className="mb-2 truncate font-mono text-[12px] font-semibold tracking-wide text-amber-200" title={service}>ECS {service}</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {deployments.map((deployment) => {
                        const health = DEPLOYMENT_HEALTH[deployment.healthState];
                        const imageVersion = deployment.images[0]?.split(":").at(-1) ?? null;
                        return <div key={`${deployment.accountName}:${deployment.service}`} className="rounded-md border border-[var(--color-border)] bg-black/15 px-2.5 py-2.5 leading-relaxed">
                          <div className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="font-bold uppercase tracking-wide text-cyan-200">{deployment.environment}</span>
                            <span className={`font-medium ${health.color}`} title={`ECS 원본: ${deployment.rolloutState ?? deployment.status ?? "없음"}`}>ECS {health.label}</span>
                          </div>
                          <div className="mt-1 truncate font-mono text-[12px] font-medium text-[var(--color-text)]" title={deployment.taskDefinition ?? undefined}>{deployment.taskDefinition ?? "TaskDefinition 미확인"}</div>
                          {imageVersion && <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-purple-200" title={deployment.images[0]}><span className="truncate">image {imageVersion}</span>{p.aws_release?.latestBuildNumber != null && <span className={`font-medium ${imageVersion === String(p.aws_release.latestBuildNumber) ? "text-emerald-300" : "text-amber-300"}`}>{imageVersion === String(p.aws_release.latestBuildNumber) ? "최신 Build" : `Build #${p.aws_release.latestBuildNumber}와 다름`}</span>}</div>}
                          <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]" title={deployment.deployedAt ? `ECS 최근 갱신 ${formatDeploymentDate(null, deployment.deployedAt)}` : "TaskDefinition 등록 시각"}>{formatDeploymentDate(deployment.taskDefinitionRegisteredAt, deployment.deployedAt)}</div>
                          <div className="text-[11px] text-[var(--color-text-muted)]">running {deployment.runningCount ?? "?"}/{deployment.desiredCount ?? "?"}</div>
                          {deployment.pinpointApplicationName && <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-[11px]" title={deployment.apmLatestHeartbeatAt ?? "Pinpoint heartbeat 없음"}>
                            <span className="truncate font-mono text-[var(--color-text-muted)]">Pinpoint {deployment.pinpointApplicationName}</span>
                            {deployment.apmState ? <span className={APM_STATE[deployment.apmState].color}>{APM_STATE[deployment.apmState].label} {deployment.apmRunningAgents ?? 0}/{deployment.apmAgentCount ?? 0}</span> : <span className="text-[var(--color-text-dim)]">동기화 필요</span>}
                          </div>}
                          {deployment.apmSignal && <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-[var(--color-border)] pt-2 text-[11px] leading-5 text-[var(--color-text-muted)]" title="Pinpoint 최근 5분 스냅샷">
                            <span className={deployment.apmSignal === "ERRORS_OBSERVED" ? "text-rose-300" : deployment.apmSignal === "TRAFFIC_OK" ? "text-emerald-300" : "text-[var(--color-text-dim)]"}>{deployment.apmSignal === "ERRORS_OBSERVED" ? `표본 오류 ${deployment.apmErrorCount}/${deployment.apmSampleCount}` : deployment.apmSignal === "TRAFFIC_OK" ? `지연 표본 ${deployment.apmSampleCount && deployment.apmSampleCount >= 5000 ? '5,000+' : deployment.apmSampleCount} · 오류 0` : deployment.apmSignal === "NO_TRAFFIC" ? "최근 트래픽 없음" : "지표 조회 불가"}</span>
                            <span className="text-right">P95 {deployment.apmP95ResponseMs ?? "-"}ms</span>
                            <span>평균 {deployment.apmAverageResponseMs ?? "-"}ms</span>
                            <span className="text-right">Apdex {deployment.apmApdexScore?.toFixed(2) ?? "-"}</span>
                          </div>}
                        </div>;
                      })}
                    </div>
                  </section>)}
                  {!p.aws_release && serviceDeployments.length === 0 && <p className="py-3 text-[12px] text-[var(--color-text-muted)]">표시할 배포 정보가 없습니다.</p>}
                  </div>}
                </li>
                );
              })}
              {(ws.projects?.length ?? 0) === 0 && (
                <li className="py-6 text-center text-[12.5px] text-[var(--color-text-dim)]">등록된 레포가 없습니다</li>
              )}
              </ul>
            </div>
          ) : activeTab === "history" ? (
            hist.loading ? (
              <LoadingSpinner />
            ) : hist.data.length === 0 ? (
              <EmptyState message="No history logs" />
            ) : (
              <div className="space-y-1">
                {hist.data.slice(s, s + PAGE_SIZE).map((log) => {
                  const decN = log.key_decisions?.length ?? 0;
                  const fileN = log.files_changed?.length ?? 0;
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedHistory(log)}
                      className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left transition-colors hover:border-purple-500/50"
                    >
                      <div className="min-w-0 flex-1" title={historyDisplayTitle(log)}>
                        <p className="line-clamp-2 text-[13px] leading-5 text-[var(--color-text-bright)]">
                          {historyDisplayTitle(log)}
                        </p>
                        {historyContextTitle(log) && (
                          <p className="mt-0.5 truncate text-[11px] font-medium text-cyan-300/75">{historyContextTitle(log)}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-[var(--color-text-dim)]">
                        {decN > 0 && (
                          <span className="flex items-center gap-0.5" title={`${decN} decisions`}>
                            <Lightbulb size={10} className="text-yellow-400" />
                            {decN}
                          </span>
                        )}
                        {fileN > 0 && (
                          <span className="flex items-center gap-0.5" title={`${fileN} files`}>
                            <FileCode size={10} className="text-blue-400" />
                            {fileN}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 font-sans text-[12px] font-semibold tracking-[0.04em] text-violet-300/90">
                          <Calendar size={12} className="text-violet-400" />
                          {historyDisplayDate(log.completed_at)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : null}
        </div>

        {total > PAGE_SIZE && (
          <div className="mt-2 flex shrink-0 items-center justify-between border-t border-[var(--color-border)] pt-2 font-mono text-[11px] text-[var(--color-text-dim)]">
            <span>
              {s + 1}–{Math.min(s + PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setInspectorPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:text-cyan-300 disabled:opacity-30"
              >
                ‹ Prev
              </button>
              <span className="px-1 text-[var(--color-text-muted)]">
                {page + 1}/{pages}
              </span>
              <button
                onClick={() => setInspectorPage((p) => Math.min(pages - 1, p + 1))}
                disabled={page >= pages - 1}
                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:text-cyan-300 disabled:opacity-30"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-full flex-col gap-3 2xl:gap-4">
      <section aria-label="워크스페이스 운영 도구" className="page-heading shrink-0 space-y-1 2xl:space-y-2">
        <div>
          <div className="page-heading__eyebrow font-mono text-[11px] font-semibold tracking-[0.18em] text-cyan-300">WORKSPACE OPERATIONS</div>
          <h1 className="page-heading__title mt-1 text-xl font-semibold tracking-[-0.02em] text-[var(--color-text-bright)] 2xl:mt-2 2xl:text-2xl">도메인 관리 <span className="align-middle text-sm font-normal text-[var(--color-text-dim)]">({filteredWorkspaces.length})</span></h1>
        </div>
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-text-muted)]">도메인별 개발 흐름과 운영 상태를 한곳에서 확인합니다.</p>
          <div className="flex min-h-9 flex-wrap items-center justify-end gap-2">
            <button onClick={() => setShowStatusGuide(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-400 transition-all hover:border-cyan-500/40 hover:text-cyan-400"><Info size={13} /> Guide</button>
            <div className="relative w-56">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input type="text" placeholder="Search history..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-7 text-[13px] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500/60" />
              {isSearching && <div className="absolute right-2.5 top-1/2 -translate-y-1/2"><div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-cyan-400" /></div>}
              {searchQuery && !isSearching && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={14} /></button>}
            </div>
            <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-[12.5px]">
              {([['all', 'All Domains'], ['recent', 'Recently Active (30d)']] as const).map(([f, label]) => <button key={f} onClick={() => setStatusFilter(f)} className={cn("rounded-md px-2.5 py-1 transition-colors", statusFilter === f ? "bg-cyan-500/15 text-cyan-200" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")}>{label}</button>)}
            </div>
            <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
              <button onClick={() => setViewMode("grid")} className={cn("rounded-md p-1.5", viewMode === "grid" ? "bg-cyan-500/15 text-cyan-200" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")} title="Grid View"><LayoutGrid size={15} /></button>
              <button onClick={() => setViewMode("list")} className={cn("rounded-md p-1.5", viewMode === "list" ? "bg-cyan-500/15 text-cyan-200" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")} title="Compact List View"><Rows3 size={15} /></button>
            </div>
            <button onClick={copyAddDomain} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-[12.5px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/10" title="/sugo:ws-add 명령 복사"><Plus size={14} /> {addCopied ? "복사됨 · /sugo:ws-add" : "Add Domain"}</button>
          </div>
        </div>
      </section>
      {isSearchMode && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
          <p className="text-sm text-[var(--color-text)]">
            <span className="font-medium">{new Set(searchResults.map((r) => r.workspace_name)).size}</span> workspace(s) with matching history for "
            <span className="font-medium">{searchQuery}</span>"
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (commandSummary.intent !== "attention") return;
          const needsAttention = workspaces.find((workspace) => (workspace.attentionCount ?? 0) > 0);
          if (needsAttention) navigate(`/schedule?reviewWorkspace=${encodeURIComponent(needsAttention.name)}`);
        }}
        className={cn(
          "command-brief ck-stage-in group flex w-full shrink-0 items-center justify-between gap-5 rounded-2xl border px-4 py-3 text-left 2xl:px-5 2xl:py-4",
          commandSummary.intent === "attention" ? "border-amber-400/25 bg-amber-400/[0.055]" : "border-[var(--color-border)] bg-[var(--color-surface)]/75",
          commandSummary.intent === "attention" ? "cursor-pointer hover:border-amber-300/45" : "cursor-default",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", commandSummary.intent === "attention" ? "bg-amber-400/12 text-amber-300" : commandSummary.intent === "stable" ? "bg-emerald-400/10 text-emerald-300" : "bg-cyan-400/10 text-cyan-300")}>
            {commandSummary.intent === "attention" ? <AlertTriangle size={19} /> : commandSummary.intent === "stable" ? <CheckCircle2 size={19} /> : <Activity size={19} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-white">{commandSummary.headline}</span>
            <span className="mt-0.5 block text-[12.5px] text-[var(--color-text-muted)]">{commandSummary.detail}</span>
          </span>
        </span>
        {commandSummary.intent === "attention" && <span className="shrink-0 text-[12px] font-semibold text-amber-200 transition-transform group-hover:translate-x-1">확인할 작업 열기 →</span>}
      </button>

      {/* 도메인 목록 */}
      {filteredWorkspaces.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
          {isSearchMode
            ? "No matching results"
            : statusFilter !== "all"
              ? "필터 조건에 맞는 도메인이 없습니다"
              : "No workspaces found"}
        </div>
      ) : isSearchMode ? (
        /*
         * 뷰 3종 중 **검색 모드** — 전폭 행 + 클릭하면 그 자리에서 펼쳐지는 상세.
         * 검색은 "어느 도메인에 있나"를 찾는 행위라, 결과를 누를 때마다 아래 인스펙터로
         * 시선이 튀면 찾던 자리를 잃는다. 그래서 결과 안에서 바로 편다.
         */
        <div className="ck-scroll max-h-[560px] space-y-1.5 overflow-auto pr-1">
          {filteredWorkspaces.map((ws, wi) => {
            const isSel = selectedWorkspace === ws.name;
            const st = statusOf(ws);
            const color = getWorkspaceColor(ws.name, wi);
            return (
              <div
                key={ws.name}
                className={cn(
                  "rounded-lg border border-[var(--color-border)] transition-[opacity,filter,background-color] duration-200",
                  workspaceCardEmphasis(isSel, selectedWorkspace !== null),
                )}
                style={{ boxShadow: workspaceCardShadow(color, isSel) }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  onClick={() => setSelectedWorkspace(isSel ? null : ws.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedWorkspace(isSel ? null : ws.name);
                  }}
                  className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5", WORKSPACE_CARD_FOCUS_CLASSES)}
                >
                  <span className="w-4 shrink-0 text-center font-mono text-[11px] text-[var(--color-text-dim)]">
                    {isSel ? "▾" : "▸"}
                  </span>
                  <span className={cn("h-2 w-2 shrink-0 rounded-full ck-pulse-dot", st.dot)} />
                  <span className="w-56 shrink-0 truncate font-mono text-[13.5px] font-bold text-white">{ws.name}</span>
                  <span className={cn("shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-bold", st.pill)}>
                    {st.text}
                  </span>
                  <div className="flex-1">{renderCounts(ws)}</div>
                  {renderVitals(ws)}
                </div>
                {isSel && (
                  <div className="ml-6 mr-3 mt-1 space-y-3 border-l-2 border-cyan-500/30 pb-3 pl-4">{renderDetail(ws)}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid shrink-0 grid-cols-1 gap-2.5 md:grid-cols-2 min-[1350px]:grid-cols-3 min-[1900px]:grid-cols-4">
          {filteredWorkspaces.map((ws, wi) => {
            const isSel = selectedWorkspace === ws.name;
            const st = statusOf(ws);
            const h = healthOf(ws);
            const color = getWorkspaceColor(ws.name, wi);
            return (
              <div
                key={ws.name}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                onClick={() => setSelectedWorkspace(isSel ? null : ws.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedWorkspace(isSel ? null : ws.name);
                }}
                className={cn(
                  "ck-card workspace-command-card flex cursor-pointer flex-col justify-between rounded-xl border border-[var(--color-border)] p-4 transition-[opacity,filter,background-color,transform,box-shadow] duration-200",
                  WORKSPACE_CARD_FOCUS_CLASSES,
                  workspaceCardEmphasis(isSel, selectedWorkspace !== null),
                  isSel && "workspace-command-card--selected",
                )}
                style={{ boxShadow: workspaceCardShadow(color, isSel) }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full ck-pulse-dot", st.dot)} />
                      <h3 className="truncate font-mono text-sm font-bold text-white">{ws.name}</h3>
                    </div>
                    <span className={cn("shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-bold", st.pill)}>
                      {st.text}
                    </span>
                  </div>
                  {h !== null && (
                    <div className="mt-2 rounded border border-[var(--color-border)] bg-slate-950/60 p-2 font-mono text-[11px]">
                      <span className="mb-0.5 block text-slate-500">Canvas Progress:</span>
                      <span
                        className={cn(
                          "font-bold",
                          h >= 90 ? "text-emerald-400" : h >= 50 ? "text-amber-400" : "text-rose-400",
                        )}
                      >
                        {ws.roadmapDoneCount ?? 0}/{ws.roadmapCount} tasks done ({h}%)
                      </span>
                    </div>
                  )}
                  {(ws.attentionCount ?? 0) > 0 ? (
                    <div className="mt-2 flex items-center gap-1.5 font-mono text-xs font-semibold text-amber-300" title={`${ws.attentionCount}개의 Task에 사람의 확인이 필요합니다`}>
                      <AlertTriangle size={13} /> {ws.attentionLabel ?? `확인 필요 ${ws.attentionCount}건`}
                    </div>
                  ) : activeOf(ws) ? (
                    <div className="mt-2 font-mono text-xs text-cyan-400">{ws.activeTaskCount} task 진행 중</div>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-nowrap items-center gap-2 border-t border-[var(--color-border)] pt-3" aria-label="워크스페이스 도구">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWorkspace(ws.name);
                        setCheckpointModal(ws.name);
                      }}
                      className="group inline-flex min-w-0 flex-none items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-1.5 text-left outline-none transition-colors hover:border-amber-400/50 hover:bg-amber-500/[0.13] focus-visible:bg-amber-500/[0.16]"
                      title={WORKSPACE_RULES_TOOL.workspaceDescription}
                    >
                      <Shield size={14} className="shrink-0 text-amber-300" />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-100">{WORKSPACE_RULES_TOOL.label}</span>
                      <span className="shrink-0 rounded-md bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">{ws.checkpointCount}</span>
                    </button>
                    {(ws.roadmapCount ?? 0) > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgentCanvasModal(ws.name);
                        }}
                        className="group inline-flex min-w-0 flex-none items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.07] px-2.5 py-1.5 text-left outline-none transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/[0.13] focus-visible:bg-cyan-500/[0.16]"
                        title={AI_WORK_STATUS_TOOL.description}
                      >
                        <Bot size={14} className="shrink-0 text-cyan-300" />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-100">{AI_WORK_STATUS_TOOL.label}</span>
                      </button>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Compact List — 단일 행 */
        <div className="ck-scroll max-h-[360px] space-y-1 overflow-auto pr-1">
          {filteredWorkspaces.map((ws, wi) => {
            const isSel = selectedWorkspace === ws.name;
            const st = statusOf(ws);
            const color = getWorkspaceColor(ws.name, wi);
            return (
              <div
                key={ws.name}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                onClick={() => setSelectedWorkspace(isSel ? null : ws.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedWorkspace(isSel ? null : ws.name);
                }}
                className={cn(
                  "ck-card flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 transition-[opacity,filter,background-color] duration-200",
                  WORKSPACE_CARD_FOCUS_CLASSES,
                  workspaceCardEmphasis(isSel, selectedWorkspace !== null),
                )}
                style={{ boxShadow: workspaceCardShadow(color, isSel) }}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full ck-pulse-dot", st.dot)} />
                <span className="w-48 shrink-0 truncate font-mono text-[13px] font-bold text-white">{ws.name}</span>
                <span className={cn("shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-bold", st.pill)}>
                  {st.text}
                </span>
                <div className="flex-1">{renderCounts(ws)}</div>
                {renderVitals(ws)}
              </div>
            );
          })}
        </div>
      )}

      {/*
        하단 2단 — 좌 LiveConsole · 우 Pinned Inspector.
        **검색 모드에선 띄우지 않는다.** 검색은 결과 행 안에서 바로 펼치는 뷰라, 아래에
        같은 인스펙터를 하나 더 띄우면 같은 내용이 두 벌로 보인다.
      */}
      {selected && !isSearchMode && (
        <div key={selected.name} className="command-detail ck-stage-in grid min-h-[300px] flex-1 grid-cols-1 gap-3 lg:grid-cols-10">
          <div className="ck-glass flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] p-3 lg:col-span-3">
            <LiveConsole workspace={selected.name} />
          </div>
          <div className="ck-glass flex min-h-[300px] flex-col rounded-xl border border-[var(--color-border)] p-3 lg:col-span-7">
            {renderInspector(selected)}
          </div>
        </div>
      )}

      {/* History 상세 모달 */}
      {selectedHistory && (
        <Modal onClose={() => setSelectedHistory(null)}>
          <h3 className="mb-1 text-[15px] font-semibold text-[var(--color-text-bright)]">
            {historyDisplayTitle(selectedHistory)}
          </h3>
          {historyContextTitle(selectedHistory) && (
            <p className="mb-1 text-[12px] font-medium text-cyan-300/80">{historyContextTitle(selectedHistory)}</p>
          )}
          <div className="mb-4 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.04em] text-violet-300/90">
              <Calendar size={12} className="text-violet-400" />
              {historyDisplayDate(selectedHistory.completed_at)}
            </span>
            <span className="font-mono text-[11px] text-[var(--color-text-dim)]">{selectedHistory.id}</span>
          </div>
          {selectedHistory.summary && (
            <p className="mb-4 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
              {presentSteKorean(selectedHistory.summary)}
            </p>
          )}
          {(selectedHistory.key_decisions?.length ?? 0) > 0 && (
            <div className="mb-4">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-yellow-400">
                <Lightbulb size={13} /> 주요 결정
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-[var(--color-text-muted)]">
                {selectedHistory.key_decisions!.map((d, i) => (
                  <li key={i} className="whitespace-pre-line">{presentSteKorean(d)}</li>
                ))}
              </ul>
            </div>
          )}
          {(selectedHistory.files_changed?.length ?? 0) > 0 && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-blue-400">
                <FileCode size={13} /> 변경 파일 ({selectedHistory.files_changed!.length})
              </h4>
              <ul className="space-y-0.5 font-mono text-[11.5px] text-[var(--color-text-muted)]">
                {selectedHistory.files_changed!.map((f, i) => (
                  <li key={i} className="truncate" title={f}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}

      {/* Checkpoints 모달 — 커밋 전 재발방지 체크리스트. SchedulePage와 공유하려고
          자기완결형 컴포넌트로 분리했다(동작 변경 없음). */}
      {checkpointModal && (
        <CheckpointPanel workspace={checkpointModal} onClose={() => setCheckpointModal(null)} />
      )}

      {/* 로드맵(Agent Canvas) 전체화면 오버레이 모달 — z-[70] */}
      {agentCanvasModal && (
        <AgentCanvasOverlay workspace={agentCanvasModal} onClose={() => setAgentCanvasModal(null)} />
      )}

      {/* Guide 모달 — 상태 뱃지가 무슨 뜻인지 */}
      {showStatusGuide && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          onMouseDown={() => setShowStatusGuide(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-xl border border-cyan-500/40 ck-glass ck-glow-cyan p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text-bright)]">
                <Info size={16} className="text-cyan-300" /> 상태 가이드
              </h3>
              <button
                onClick={() => setShowStatusGuide(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="space-y-2.5 text-[13px] text-[var(--color-text-muted)]">
              {(
                [
                  { dot: "bg-amber-400", desc: "IN PROGRESS — 캔버스에 진행 중인 task가 있음(AI 착수~사용자 완료 전)" },
                  { dot: "bg-emerald-400", desc: "COMPLETED — 이 도메인 Agent Canvas의 모든 Task 100% 완료" },
                  { dot: "bg-slate-500", desc: "IDLE — 진행 세션 없음 · 미완료 Task 남음(대기)" },
                ] as const
              ).map((row) => (
                <li key={row.desc} className="flex items-start gap-2.5">
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", row.dot)} />
                  <span>{row.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
