import { useMemo, useState } from "react";
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
  Search,
  Shield,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { useWorkspaces, type WorkspaceSummary } from "../hooks/useWorkspaces.js";

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
          ) : (
            // ⚠️ 설계안은 여기서 실제 History/ADR 행을 그리고 클릭 시 상세 모달을 연다.
            // 그 훅(useWorkspaceHistory/useWorkspaceDecisions)이 아직 없어 **개수만** 정직하게
            // 보여준다 — 없는 데이터를 지어내지 않는다. P4-17 잔여.
            <div className="py-6 text-center text-[12.5px] text-[var(--color-text-dim)]">
              {total > 0 ? `${total}건 — 목록 렌더는 미구현(P4-17 잔여)` : "항목이 없습니다"}
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
            <span className="font-medium">{filteredWorkspaces.length}</span> workspace(s) with matching history for "
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
            {searchQuery && (
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
                          navigate(`/roadmap/${encodeURIComponent(ws.name)}`);
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

      {/* 하단 Pinned Inspector — 카드를 고르면 열린다 */}
      {selected && (
        <div className="ck-glass flex h-[300px] flex-col rounded-xl border border-[var(--color-border)] p-3">
          {renderInspector(selected)}
        </div>
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
