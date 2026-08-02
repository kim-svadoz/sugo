import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bot,
  FileText,
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
  ChevronRight,
  FileCode,
  Lightbulb,
  Search,
  Shield,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { useWorkspaces, type WorkspaceSummary } from "../hooks/useWorkspaces.js";
import {
  formatDate,
  useWorkspaceCheckpoints,
  useWorkspaceDecisions,
  useWorkspaceHistory,
  type Decision,
  type HistoryLog,
} from "../hooks/useWorkspaceData.js";
import { LiveConsole } from "../components/LiveConsole.js";
import { searchHistory, type HistorySearchResult } from "../api/client.js";
import { createWorkspaceCheckpoint, deleteWorkspaceCheckpoint } from "../api/workspacesApi.js";
import { useAuth } from "../auth/AuthContext.js";
import { RoadmapTab } from "../components/roadmap/RoadmapTab.js";
import { LiveLogTail } from "../components/LiveConsole.js";
import { useRoadmap } from "../hooks/useRoadmap.js";

/** 설계안 상수 — 인스펙터는 10개씩 끊는다(200개여도 스크롤 지옥이 안 되게). */
const PAGE_SIZE = 10;

const INSPECTOR_TABS = [
  { id: "history" as const, label: "History", icon: History },
  { id: "adr" as const, label: "ADR", icon: FileText },
  { id: "repositories" as const, label: "Repositories", icon: Package },
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

/** 설계안 statusOf — 진행 중이 최우선, 그 다음 100% 완료, 나머지는 IDLE. */
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

/** 설계안 Sessions 서브컴포넌트 — Modal / LoadingSpinner / EmptyState. */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end border-b border-[var(--color-border)] p-2">
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-border)]" title="Close (ESC)">
            <X size={20} className="text-[var(--color-text-muted)]" />
          </button>
        </div>
        <div className="max-h-[calc(80vh-60px)] overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-8 text-center text-[12.5px] text-[var(--color-text-dim)]">{message}</div>;
}

/**
 * 설계안 로드맵(Agent Canvas) 전체화면 오버레이 — `z-[70]`.
 *
 * **본문은 `<RoadmapGraph fill />`이다(리스트가 아니다).** 전체화면 페이지와 같은 그래프를
 * 그대로 띄우는 게 스펙이고, 그래야 "캔버스"가 화면마다 다른 걸 가리키지 않는다.
 *
 * 화면을 거의 다 쓴다(`m-3 flex-1`) — 위상 그래프를 좁은 모달에 넣으면 노드가 겹쳐서
 * 팬/줌을 해야만 읽히고, 그러면 "훑어보는" 용도 자체가 성립하지 않는다.
 */
function AgentCanvasOverlay({ workspace, onClose }: { workspace: string; onClose: () => void }) {
  const { data, refetch } = useRoadmap(workspace);
  const nodes = data ?? [];
  const specNode = nodes.find((n) => n.level === "spec");
  const specLabel = specNode?.spec_path ? specNode.spec_path.split(/[\\/]/).filter(Boolean).pop() : specNode?.title;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/60 backdrop-blur-sm"
      style={{ animation: "agentCanvasModalFade 0.2s ease" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative m-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]"
        style={{
          animation: "agentCanvasModalUp 0.3s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
              <span className="font-mono text-cyan-300/80">SYSTEM</span>
              <ChevronRight size={12} />
              <span className="font-semibold text-[var(--color-text)]">{workspace}</span>
              {specLabel && (
                <>
                  <ChevronRight size={12} />
                  <span className="truncate font-mono">AGENT CANVAS: {specLabel}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-cyan-300" />
              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10.5px] text-cyan-300">
                4-Tier · Spec ⊃ Run ⊃ Task ⊃ REQ
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className="hidden items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] sm:inline-flex"
              title="4초 폴링으로 실시간 반영"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ck-pulse-dot" /> Polling 4s
            </span>
            <span className="hidden text-[13px] text-[var(--color-text-muted)] sm:inline">Esc로 닫기</span>
            <button
              onClick={onClose}
              className="group flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] transition-all hover:border-rose-400 hover:bg-rose-500/15 hover:text-white"
              title="닫기 (Esc)"
            >
              <X size={20} className="transition-transform group-hover:rotate-90" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
              Agent Canvas 데이터가 없습니다
            </div>
          ) : (
            <RoadmapTab workspace={workspace} fill onEdited={refetch} />
          )}
        </div>

        <div className="shrink-0 px-3 pb-3 pt-1">
          <LiveLogTail workspace={workspace} />
        </div>
      </div>
      <style>{`
        @keyframes agentCanvasModalFade{from{opacity:0}to{opacity:1}}
        @keyframes agentCanvasModalUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
    </div>
  );
}

export function Sessions() {
  const { data, loading } = useWorkspaces();
  const navigate = useNavigate();

  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("history");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<"all" | "recent">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectorPage, setInspectorPage] = useState(0);
  const [showStatusGuide, setShowStatusGuide] = useState(false);
  const [addCopied, setAddCopied] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryLog | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [checkpointModal, setCheckpointModal] = useState<string | null>(null);
  const [agentCanvasModal, setAgentCanvasModal] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<HistorySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cpDraft, setCpDraft] = useState({ id: "", title: "", category: "general", checklist: "" });
  const [cpBusy, setCpBusy] = useState(false);
  const { userId } = useAuth();

  const history = useWorkspaceHistory(selectedWorkspace);
  const decisions = useWorkspaceDecisions(selectedWorkspace);
  const checkpoints = useWorkspaceCheckpoints(checkpointModal);

  const workspaces = useMemo(() => data ?? [], [data]);
  const isSearchMode = searchQuery.trim().length >= 2;

  const filteredWorkspaces = useMemo(() => {
    let list = workspaces;
    if (statusFilter === "recent") {
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      list = list.filter((w) => w.lastActivityAt !== null && new Date(w.lastActivityAt).getTime() >= cutoff);
    }
    if (isSearchMode) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q));
    }
    return list;
  }, [workspaces, statusFilter, searchQuery, isSearchMode]);

  // 설계안 디바운스 검색 — 2자 미만이면 결과를 비운다(한 글자에 전체 스캔을 돌리지 않는다).
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

  // Agent Canvas 오버레이가 열려 있는 동안 배경 스크롤을 잠근다(설계안).
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
      {ws.decisionCount > 0 && (
        <div className="flex items-center gap-1 text-sky-400" title="ADR">
          <FileText size={14} />
          <span>{ws.decisionCount}</span>
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

  const renderInspector = (ws: WorkspaceSummary) => {
    const total =
      activeTab === "history" ? ws.historyCount : activeTab === "adr" ? ws.decisionCount : (ws.projects?.length ?? 0);
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
              const count =
                t.id === "history" ? ws.historyCount : t.id === "adr" ? ws.decisionCount : (ws.projects?.length ?? 0);
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
            <ul className="space-y-1">
              {(ws.projects ?? []).slice(s, s + PAGE_SIZE).map((p) => (
                <li
                  key={p.project_path}
                  className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 font-mono text-[12px]"
                >
                  <span className="truncate text-[var(--color-text)]" title={p.project_path}>
                    📦 {repoName(p.project_path)}
                  </span>
                  {p.git_synced === 1 && <span className="shrink-0 text-[11px] text-emerald-400">git synced ✓</span>}
                </li>
              ))}
              {(ws.projects?.length ?? 0) === 0 && (
                <li className="py-6 text-center text-[12.5px] text-[var(--color-text-dim)]">등록된 레포가 없습니다</li>
              )}
            </ul>
          ) : activeTab === "history" ? (
            history.loading ? (
              <LoadingSpinner />
            ) : history.data.length === 0 ? (
              <EmptyState message="No history logs" />
            ) : (
              <div className="space-y-1">
                {history.data.slice(s, s + PAGE_SIZE).map((log) => {
                  const decN = log.key_decisions?.length ?? 0;
                  const fileN = log.files_changed?.length ?? 0;
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedHistory(log)}
                      className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left transition-colors hover:border-purple-500/50"
                    >
                      <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text)]">
                        {log.task_title || log.summary || log.id}
                      </p>
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
                        <span className="flex items-center gap-0.5">
                          <Calendar size={10} />
                          {formatDate(log.completed_at)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : decisions.loading ? (
            <LoadingSpinner />
          ) : decisions.data.length === 0 ? (
            <EmptyState message="No ADR (Architecture Decision Records)" />
          ) : (
            <div className="space-y-1">
              {decisions.data.slice(s, s + PAGE_SIZE).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDecision(d)}
                  className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left transition-colors hover:border-blue-500/50"
                >
                  <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
                    {d.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text)]">{d.title}</span>
                  {d.status && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold",
                        d.status === "승인됨" || d.status === "accepted"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-500/20 text-gray-400",
                      )}
                    >
                      {d.status}
                    </span>
                  )}
                  {d.decision_date && (
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]">
                      {formatDate(d.decision_date)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
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
    <div className="space-y-4">
      {isSearchMode && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
          <p className="text-sm text-[var(--color-text)]">
            <span className="font-medium">{new Set(searchResults.map((r) => r.workspace_name)).size}</span> workspace(s) with matching history for "
            <span className="font-medium">{searchQuery}</span>"
          </p>
        </div>
      )}

      {/* 1단 통합 툴바 — Domains(N) ··· Guide · 검색 · 필터 · 뷰토글 · Add Domain */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="shrink-0 text-lg font-semibold text-[var(--color-text-bright)]">
          Domains <span className="text-sm font-normal text-[var(--color-text-dim)]">({filteredWorkspaces.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowStatusGuide(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-400 transition-all hover:border-cyan-500/40 hover:text-cyan-400"
          >
            <Info size={13} /> Guide
          </button>
          <div className="relative w-56">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-7 text-[13px] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
            />
            {isSearching && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-cyan-400" />
              </div>
            )}
            {searchQuery && !isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-[12.5px]">
            {(
              [
                ["all", "All Domains"],
                ["recent", "Recently Active (30d)"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 transition-colors",
                  statusFilter === f
                    ? "bg-cyan-500/15 text-cyan-200"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-md p-1.5",
                viewMode === "grid"
                  ? "bg-cyan-500/15 text-cyan-200"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-1.5",
                viewMode === "list"
                  ? "bg-cyan-500/15 text-cyan-200"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
              title="Compact List View"
            >
              <Rows3 size={15} />
            </button>
          </div>
          <button
            onClick={copyAddDomain}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-[12.5px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/10"
            title="/sugo:ws-add 명령 복사"
          >
            <Plus size={14} /> {addCopied ? "복사됨 · /sugo:ws-add" : "Add Domain"}
          </button>
        </div>
      </div>

      {/* 도메인 목록 */}
      {filteredWorkspaces.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
          {isSearchMode
            ? "No matching results"
            : statusFilter !== "all"
              ? "필터 조건에 맞는 도메인이 없습니다"
              : "No workspaces found"}
        </div>
      ) : viewMode === "grid" ? (
        <div className="ck-scroll grid max-h-[360px] grid-cols-1 gap-2.5 overflow-auto pr-1 md:grid-cols-2 xl:grid-cols-4">
          {filteredWorkspaces.map((ws) => {
            const isSel = selectedWorkspace === ws.name;
            const st = statusOf(ws);
            const h = healthOf(ws);
            return (
              <div
                key={ws.name}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedWorkspace(isSel ? null : ws.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedWorkspace(isSel ? null : ws.name);
                }}
                className={cn(
                  "ck-card flex cursor-pointer flex-col justify-between rounded-xl border bg-[var(--color-surface)] p-4",
                  isSel ? "neon-border-cyan border-cyan-500/60" : "border-[var(--color-border)]",
                )}
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
                  {ws.projects && ws.projects.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {ws.projects.slice(0, 4).map((p) => (
                        <span
                          key={p.project_path}
                          title={p.project_path}
                          className="rounded border border-[var(--color-border)] bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                        >
                          📦 {repoName(p.project_path)}
                        </span>
                      ))}
                      {ws.projects.length > 4 && (
                        <span className="rounded border border-[var(--color-border)] bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          +{ws.projects.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  {activeOf(ws) && (
                    <div className="mt-2 font-mono text-xs text-cyan-400">{ws.activeTaskCount} task 진행 중</div>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWorkspace(ws.name);
                        setCheckpointModal(ws.name);
                      }}
                      className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
                      title="체크포인트 관리"
                    >
                      <Shield size={12} /> {ws.checkpointCount}
                    </button>
                    {(ws.roadmapCount ?? 0) > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgentCanvasModal(ws.name);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 px-3 py-1.5 text-xs font-bold text-purple-300 transition-all hover:from-purple-600/40 hover:to-indigo-600/40"
                        title="Agent Canvas 전체화면으로 보기"
                      >
                        <Bot size={14} className="text-purple-300" /> Agent Canvas
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Compact List — 단일 행 */
        <div className="ck-scroll max-h-[360px] space-y-1 overflow-auto pr-1">
          {filteredWorkspaces.map((ws) => {
            const isSel = selectedWorkspace === ws.name;
            const st = statusOf(ws);
            return (
              <div
                key={ws.name}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedWorkspace(isSel ? null : ws.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedWorkspace(isSel ? null : ws.name);
                }}
                className={cn(
                  "ck-card flex cursor-pointer items-center gap-3 rounded-lg border bg-[var(--color-surface)] px-3 py-2",
                  isSel ? "neon-border-cyan border-cyan-500/60" : "border-[var(--color-border)]",
                )}
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

      {/* 하단 2단 — 좌 LiveConsole · 우 Pinned Inspector (설계안 MAIN RETURN 하단) */}
      {selected && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="ck-glass flex h-[300px] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] p-3">
            <LiveConsole workspace={selected.name} />
          </div>
          <div className="ck-glass flex h-[300px] flex-col rounded-xl border border-[var(--color-border)] p-3">
            {renderInspector(selected)}
          </div>
        </div>
      )}

      {/* History 상세 모달 */}
      {selectedHistory && (
        <Modal onClose={() => setSelectedHistory(null)}>
          <h3 className="mb-1 text-[15px] font-semibold text-[var(--color-text-bright)]">
            {selectedHistory.task_title || selectedHistory.id}
          </h3>
          <p className="mb-4 font-mono text-[11px] text-[var(--color-text-dim)]">
            {formatDate(selectedHistory.completed_at)} · {selectedHistory.id}
          </p>
          {selectedHistory.summary && (
            <p className="mb-4 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
              {selectedHistory.summary}
            </p>
          )}
          {(selectedHistory.key_decisions?.length ?? 0) > 0 && (
            <div className="mb-4">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-yellow-400">
                <Lightbulb size={13} /> 주요 결정
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-[var(--color-text-muted)]">
                {selectedHistory.key_decisions!.map((d, i) => (
                  <li key={i}>{d}</li>
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

      {/* ADR 상세 모달 */}
      {selectedDecision && (
        <Modal onClose={() => setSelectedDecision(null)}>
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
              {selectedDecision.id}
            </span>
            {selectedDecision.status && (
              <span className="rounded bg-gray-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-gray-400">
                {selectedDecision.status}
              </span>
            )}
            <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
              {formatDate(selectedDecision.decision_date)}
            </span>
          </div>
          <h3 className="mb-3 text-[15px] font-semibold text-[var(--color-text-bright)]">{selectedDecision.title}</h3>
          <div className="adr-content whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
            {selectedDecision.content ?? "(본문 없음)"}
          </div>
        </Modal>
      )}

      {/* Checkpoints 모달 — 커밋 전 재발방지 체크리스트 */}
      {checkpointModal && (
        <Modal onClose={() => setCheckpointModal(null)}>
          <h3 className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text-bright)]">
            <Shield size={16} className="text-amber-400" /> {checkpointModal} 체크포인트
          </h3>
          <p className="mb-4 text-[12px] text-[var(--color-text-muted)]">
            커밋 전에 확인할 재발방지 목록입니다. 플러그인이 `applies_to` 매칭으로 자동 적용합니다.
          </p>
          {checkpoints.loading ? (
            <LoadingSpinner />
          ) : checkpoints.data.length === 0 ? (
            <EmptyState message="등록된 체크포인트가 없습니다" />
          ) : (
            <div className="space-y-3">
              {checkpoints.data.map((cp) => (
                <div key={cp.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                      {cp.id}
                    </span>
                    <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
                      {cp.category}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text)]">{cp.title}</span>
                    <button
                      disabled={cpBusy || !userId}
                      onClick={async () => {
                        setCpBusy(true);
                        try {
                          await deleteWorkspaceCheckpoint(userId!, checkpointModal, cp.id);
                          checkpoints.refresh();
                        } finally {
                          setCpBusy(false);
                        }
                      }}
                      className="shrink-0 rounded border border-rose-500/40 px-1.5 py-0.5 text-[10.5px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </div>
                  {(cp.checklist?.length ?? 0) > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-[var(--color-text-muted)]">
                      {cp.checklist!.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* 설계안 체크포인트 CRUD — 추가/삭제. 체크리스트는 줄 단위로 입력받는다. */}
          <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-3">
            <div className="font-mono text-[11px] text-[var(--color-text-muted)]">새 체크포인트</div>
            <div className="flex flex-wrap gap-2">
              <input
                value={cpDraft.id}
                onChange={(e) => setCpDraft({ ...cpDraft, id: e.target.value })}
                placeholder="CP-003"
                className="w-28 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)]"
              />
              <input
                value={cpDraft.category}
                onChange={(e) => setCpDraft({ ...cpDraft, category: e.target.value })}
                placeholder="category"
                className="w-28 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)]"
              />
              <input
                value={cpDraft.title}
                onChange={(e) => setCpDraft({ ...cpDraft, title: e.target.value })}
                placeholder="제목"
                className="min-w-40 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[12.5px] text-[var(--color-text)]"
              />
            </div>
            <textarea
              value={cpDraft.checklist}
              onChange={(e) => setCpDraft({ ...cpDraft, checklist: e.target.value })}
              placeholder={"체크리스트 — 한 줄에 하나"}
              rows={3}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[12.5px] text-[var(--color-text)]"
            />
            <button
              disabled={cpBusy || !cpDraft.id.trim() || !cpDraft.title.trim() || !userId}
              onClick={async () => {
                setCpBusy(true);
                try {
                  await createWorkspaceCheckpoint(userId!, checkpointModal, {
                    id: cpDraft.id.trim(),
                    category: cpDraft.category.trim() || "general",
                    title: cpDraft.title.trim(),
                    checklist: cpDraft.checklist
                      .split(/\r?\n/)
                      .map((l) => l.trim())
                      .filter(Boolean),
                    appliesTo: [],
                  });
                  setCpDraft({ id: "", title: "", category: "general", checklist: "" });
                  checkpoints.refresh();
                } finally {
                  setCpBusy(false);
                }
              }}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px] font-bold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
            >
              추가
            </button>
          </div>
        </Modal>
      )}

      {/* 로드맵(Agent Canvas) 전체화면 오버레이 모달 — z-[70] (설계안) */}
      {agentCanvasModal && (
        <AgentCanvasOverlay workspace={agentCanvasModal} onClose={() => setAgentCanvasModal(null)} />
      )}

      {/* Guide 모달 — 상태 뱃지가 무슨 뜻인지(설계안 statusOf.desc) */}
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
