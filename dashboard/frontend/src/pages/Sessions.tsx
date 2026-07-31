import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspaces, type WorkspaceSummary } from "../hooks/useWorkspaces.js";

// §5 Sessions(홈) — Domain 카드 + 검색/상태필터/grid·list 토글 + Add Domain(/sugo:ws-add 복사).
type StatusKind = "IN PROGRESS" | "COMPLETED" | "IDLE";
type Filter = "ALL" | StatusKind;

function statusOf(ws: WorkspaceSummary): StatusKind {
  const progress = ws.roadmap.total > 0 ? (ws.roadmap.done / ws.roadmap.total) * 100 : 0;
  if (ws.taskCounts.in_progress > 0) return "IN PROGRESS";
  if (ws.roadmap.total > 0 && progress === 100) return "COMPLETED";
  return "IDLE";
}

const STATUS_STYLE: Record<StatusKind, { color: string; bg: string }> = {
  "IN PROGRESS": { color: "#fbbf24", bg: "rgba(245,158,11,0.12)" },
  COMPLETED: { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  IDLE: { color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-[0.68rem] font-mono text-slate-400">
        <span>Canvas Progress</span>
        <span>{done}/{total} · {pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))", boxShadow: "0 0 8px rgba(0,180,216,0.5)" }} />
      </div>
    </div>
  );
}

function DomainCard({ ws }: { ws: WorkspaceSummary }) {
  const status = statusOf(ws);
  const s = STATUS_STYLE[status];
  return (
    <Link to={`/roadmap/${encodeURIComponent(ws.name)}`} className="ck-glass ck-card ck-line-in block hover:ck-glow-cyan">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold">{ws.name}</span>
        <span className="ck-pill" style={{ color: s.color, background: s.bg, borderColor: s.color + "55" }}>
          <span className="h-1.5 w-1.5 rounded-full ck-pulse-dot" style={{ background: s.color }} />
          {status}
        </span>
      </div>
      <ProgressBar done={ws.roadmap.done} total={ws.roadmap.total} />
      <div className="mt-3 flex flex-wrap gap-1.5 text-[0.66rem] font-mono">
        <span className="ck-pill" style={{ color: "#fbbf24" }}>진행 {ws.taskCounts.in_progress}</span>
        <span className="ck-pill" style={{ color: "#34d399" }}>완료 {ws.taskCounts.done}</span>
        <span className="ck-pill text-slate-400">대기 {ws.taskCounts.pending}</span>
        {ws.taskCounts.archived > 0 && <span className="ck-pill text-slate-500">보관 {ws.taskCounts.archived}</span>}
      </div>
      {ws.projects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {ws.projects.map((p) => (
            <span key={p.project_path} className="truncate rounded bg-white/5 px-2 py-0.5 text-[0.66rem] text-slate-300" title={p.project_path}>
              {p.project_path.split(/[\\/]/).pop()}
              {p.git_synced ? <span className="text-emerald-400"> ✓</span> : null}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

function AddDomain() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const cmd = `/sugo:ws-add ${name || "<이름>"}`;
  async function copy() {
    if (!name) return;
    try {
      await navigator.clipboard.writeText(`/sugo:ws-add ${name}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="relative">
      <button type="button" className="ck-btn ck-btn-primary" onClick={() => setOpen((o) => !o)}>
        + Add Domain
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-lg p-3 ck-glass neon-border-cyan">
          <div className="text-xs text-slate-300">워크스페이스는 플러그인이 생성합니다. 이름을 정하고 명령을 복사해 플러그인 세션에서 실행하세요.</div>
          <input className="ck-input" placeholder="워크스페이스 이름" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <code className="block break-all rounded bg-black/40 px-2 py-1 text-[0.7rem]" style={{ color: "var(--color-primary)" }}>{cmd}</code>
          <button type="button" className="ck-btn w-full text-xs" disabled={!name} onClick={() => void copy()}>
            {copied ? "복사됨 ✓" : "명령 복사"}
          </button>
        </div>
      )}
    </div>
  );
}

export function Sessions() {
  const { data, loading, error } = useWorkspaces();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((ws) => {
      if (q && !ws.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (filter !== "ALL" && statusOf(ws) !== filter) return false;
      return true;
    });
  }, [data, q, filter]);

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-bold ck-text-glow" style={{ color: "var(--color-primary)" }}>
          Workspaces
        </h1>
        <span className="ck-pill text-slate-400">{data?.length ?? 0} domains</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input className="ck-input w-48" placeholder="검색…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex overflow-hidden rounded-lg border border-white/10 text-xs">
            {(["ALL", "IN PROGRESS", "COMPLETED", "IDLE"] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`px-2.5 py-1.5 font-mono ${filter === f ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                style={filter === f ? { background: "rgba(0,180,216,0.15)" } : undefined}>
                {f === "ALL" ? "전체" : f === "IN PROGRESS" ? "진행" : f === "COMPLETED" ? "완료" : "대기"}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            <button type="button" onClick={() => setView("grid")} className={`px-2 py-1.5 ${view === "grid" ? "text-cyan-300" : "text-slate-500"}`} title="Grid">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
            </button>
            <button type="button" onClick={() => setView("list")} className={`px-2 py-1.5 ${view === "list" ? "text-cyan-300" : "text-slate-500"}`} title="List">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="3" y="4" width="18" height="3" rx="1" /><rect x="3" y="10.5" width="18" height="3" rx="1" /><rect x="3" y="17" width="18" height="3" rx="1" /></svg>
            </button>
          </div>
          <AddDomain />
        </div>
      </div>

      {loading && <div className="text-sm opacity-70">불러오는 중…</div>}
      {error && <div className="ck-glass ck-card text-sm text-red-400">에러: {error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="ck-glass ck-card ck-scan text-sm text-slate-400">
          {data && data.length === 0 ? (
            <>
              아직 워크스페이스가 없습니다. 우측 상단 <b>+ Add Domain</b>으로 이름을 정하고, 플러그인 세션에서{" "}
              <code style={{ color: "var(--color-primary)" }}>/sugo:ws-add</code> → <code style={{ color: "var(--color-primary)" }}>/sugo:feat</code> 을 돌리면 여기에 채워집니다.
            </>
          ) : (
            "검색/필터 결과가 없습니다."
          )}
        </div>
      )}

      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ws) => <DomainCard key={ws.name} ws={ws} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ws) => {
            const status = statusOf(ws);
            const s = STATUS_STYLE[status];
            const pct = ws.roadmap.total > 0 ? Math.round((ws.roadmap.done / ws.roadmap.total) * 100) : 0;
            return (
              <Link key={ws.name} to={`/roadmap/${encodeURIComponent(ws.name)}`} className="ck-glass ck-card ck-line-in flex items-center gap-4 py-2.5 hover:ck-glow-cyan">
                <span className="ck-pill shrink-0" style={{ color: s.color, background: s.bg, borderColor: s.color + "55" }}>{status}</span>
                <span className="font-mono text-sm">{ws.name}</span>
                <div className="ml-auto flex items-center gap-3 text-[0.7rem] font-mono text-slate-400">
                  <span>{ws.projects.length} proj</span>
                  <span>{ws.roadmap.done}/{ws.roadmap.total} · {pct}%</span>
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
