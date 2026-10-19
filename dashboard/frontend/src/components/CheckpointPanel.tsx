import { useMemo, useState } from "react";
import { marked } from "marked";
import { AlertTriangle, CalendarClock, Check, Eye, Pencil, Shield } from "lucide-react";
import { DatePicker } from "./DatePicker.js";
import { Modal } from "./Modal.js";
import { LoadingSpinner, EmptyState } from "./StatusViews.js";
import { useWorkspaceCheckpoints, type Checkpoint } from "../hooks/useWorkspaceData.js";
import {
  applyWorkspaceCheckpoints,
  createWorkspaceCheckpoint,
  deleteWorkspaceCheckpoint,
  updateWorkspaceCheckpoint,
  type WorkspaceCheckpointApplyResult,
} from "../api/workspacesApi.js";
import { WORKSPACE_RULES_TOOL } from "../lib/workspaceTools.js";
import { useAuth } from "../auth/AuthContext.js";

/** Sessions.tsx `repoName`과 동일한 1줄 헬퍼 — 순환 import를 피하려고 그대로 복제. */
function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

/** Harness.tsx와 같은 렌더러(`marked` + `.md-body`) — 체크포인트 본문도 같은 마크다운이다. */
function renderMd(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

const CHECKPOINTS_PER_PAGE = 5;

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function expiryState(expiresAt: string | null, today = todayKst()): "none" | "active" | "soon" | "expired" {
  if (!expiresAt) return "none";
  const date = expiresAt.slice(0, 10);
  if (date < today) return "expired";
  const days = Math.round((Date.parse(`${date}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / 86_400_000);
  return days <= 3 ? "soon" : "active";
}

export function orderVisibleCheckpoints(
  checkpoints: Checkpoint[],
  projectLabel: string | null,
  today = todayKst(),
): Checkpoint[] {
  const relevant = projectLabel
    ? checkpoints.filter((cp) => !cp.applies_to?.length || cp.applies_to.includes(projectLabel))
    : checkpoints.filter((cp) => !cp.expires_at);

  if (!projectLabel) {
    return [...relevant].sort(
      (a, b) =>
        (a.checkpoint_date || a.created_at).localeCompare(b.checkpoint_date || b.created_at)
        || a.id.localeCompare(b.id),
    );
  }

  return relevant
    .filter((cp) => expiryState(cp.expires_at, today) !== "expired")
    .sort((a, b) => {
      if (a.expires_at && b.expires_at) {
        const expiryOrder = a.expires_at.slice(0, 10).localeCompare(b.expires_at.slice(0, 10));
        if (expiryOrder !== 0) return expiryOrder;
      } else if (a.expires_at) {
        return -1;
      } else if (b.expires_at) {
        return 1;
      }
      return (a.checkpoint_date || a.created_at).localeCompare(b.checkpoint_date || b.created_at)
        || a.id.localeCompare(b.id);
    });
}

/** 작성/미리보기 탭 + textarea 한 벌 — 새 체크포인트·수정 다이얼로그가 그대로 공유한다. */
function MarkdownEditor({
  value,
  onChange,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const [view, setView] = useState<"write" | "preview">("write");
  return (
    <div className={className}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <div><div className="text-[13px] font-semibold text-[var(--color-text-bright)]">규칙 내용</div><div className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">Markdown</div></div>
        <div className="flex items-center gap-1 rounded-lg bg-[var(--color-background)] p-1 text-[11px] font-semibold">
          <button type="button" onClick={() => setView("write")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${view === "write" ? "bg-cyan-500/15 text-cyan-200" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"}`}><Pencil size={12} /> 작성</button>
          <button type="button" onClick={() => setView("preview")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${view === "preview" ? "bg-cyan-500/15 text-cyan-200" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"}`}><Eye size={12} /> 미리보기</button>
        </div>
      </div>
      {view === "write" ? (
        <textarea
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Markdown 문법으로 작성하세요 — # 제목, - 목록, **굵게** 등"}
          rows={9}
          className="ck-scroll w-full resize-y bg-[#070b12] px-4 py-4 font-mono text-[13px] leading-6 text-slate-200 outline-none placeholder:text-slate-600"
        />
      ) : value.trim() ? (
        <div className="md-body ck-scroll min-h-[248px] max-h-[360px] overflow-y-auto bg-[#070b12] px-5 py-4" dangerouslySetInnerHTML={{ __html: renderMd(value) }} />
      ) : (
        <div className="min-h-[248px] bg-[#070b12] px-3 py-20 text-center text-[12px] text-[var(--color-text-dim)]">
          아직 내용이 없습니다 — 작성 탭에서 입력하면 여기 미리보기가 뜹니다.
        </div>
      )}
    </div>
  );
}

/**
 * Checkpoints 모달 — 체크포인트는 다른 화면으로 리다이렉트하지 않고 그 자리에서 모달로만
 * 뜨므로 자기완결형으로 만들었다.
 * workspace 하나만 받아 내부에서 전부 처리하므로 Sessions.tsx·SchedulePage 어디서든
 * `<CheckpointPanel workspace={...} onClose={...} />`로 그대로 마운트하면 된다.
 *
 * `projectPath`를 주면 스펙 상세에서 연 "프로젝트 체크포인트" 모드다 — 새로 만드는
 * 체크포인트는 그 프로젝트에만 적용되도록(`appliesTo`) 기본값이 채워지고, 목록도
 * 이 프로젝트와 무관한(다른 프로젝트 전용) 체크포인트는 화면에서만 숨긴다.
 */
export function CheckpointPanel({
  workspace,
  onClose,
  projectPath = null,
  defaultExpiresAt = null,
}: {
  workspace: string;
  onClose: () => void;
  projectPath?: string | null;
  defaultExpiresAt?: string | null;
}) {
  const { userId } = useAuth();
  const checkpoints = useWorkspaceCheckpoints(workspace);
  const projectLabel = projectPath ? repoName(projectPath) : null;
  const defaultAppliesTo = useMemo(() => (projectLabel ? [projectLabel] : []), [projectLabel]);
  const visibleCheckpoints = useMemo(
    () => orderVisibleCheckpoints(checkpoints.data, projectLabel),
    [checkpoints.data, projectLabel],
  );
  const [cpDraft, setCpDraft] = useState({ title: "", category: "general", markdown: "", expiresAt: "" });
  const [cpBusy, setCpBusy] = useState(false);
  // 프로젝트 화면은 활성 체크포인트를 만료일 순으로, 워크스페이스 화면은 영구 규칙만 보여준다.
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(visibleCheckpoints.length / CHECKPOINTS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedCheckpoints = visibleCheckpoints.slice(safePage * CHECKPOINTS_PER_PAGE, safePage * CHECKPOINTS_PER_PAGE + CHECKPOINTS_PER_PAGE);
  const [cpApplyResult, setCpApplyResult] = useState<WorkspaceCheckpointApplyResult | null>(null);
  const [dirtyCheckpoints, setDirtyCheckpoints] = useState<Set<string>>(new Set());
  const [editingCheckpoint, setEditingCheckpoint] = useState<Checkpoint | null>(null);
  const [editView, setEditView] = useState<"write" | "preview">("write");
  const [cpEditDraft, setCpEditDraft] = useState({ title: "", category: "general", markdown: "", expiresAt: "" });

  return (
    <>
      <Modal onClose={onClose} size="wide">
        <div className="checkpoint-panel">
        <h3 className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text-bright)]">
          <Shield size={16} className="text-amber-400" /> {projectLabel ? `${projectLabel} 프로젝트 체크포인트` : `${workspace} · ${WORKSPACE_RULES_TOOL.label}`}
        </h3>
        <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
          <p>이 도메인의 프로젝트에서 작업 컨텍스트를 불러올 때 <code>.claude/rules/&lt;category&gt;/</code>로 동기화되어 Claude Code에 자동 주입됩니다.</p>
          {projectLabel ? (
            <p className="mt-1 text-[var(--color-text-dim)]">여기서 새로 만드는 체크포인트는 기본적으로 <strong className="text-amber-300">{projectLabel}</strong> 프로젝트에만 적용됩니다. 워크스페이스 전체 체크포인트도 함께 보입니다.</p>
          ) : (
            <p className="mt-1 text-[var(--color-text-dim)]">이 워크스페이스의 체크포인트는 소속된 모든 프로젝트에 함께 적용됩니다.</p>
          )}
          <p className="mt-1 text-[var(--color-text-dim)]"><code>.claude/rules/</code>의 생성 파일은 동기화 결과입니다. 직접 수정하면 다음 적용에서 충돌로 표시하고 덮어쓰지 않습니다.</p>
        </div>
        {checkpoints.loading ? (
          <LoadingSpinner />
        ) : visibleCheckpoints.length === 0 ? (
          <EmptyState message="등록된 체크포인트가 없습니다" />
        ) : (
          <div className="space-y-3">
            {pagedCheckpoints.map((cp) => {
              const state = expiryState(cp.expires_at);
              const expiryTone = state === "expired"
                ? "border-rose-400/45 bg-rose-500/10 text-rose-200"
                : state === "soon"
                  ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
                  : "border-cyan-400/35 bg-cyan-500/[0.08] text-cyan-200";

              return (
              <div key={cp.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                    {cp.id}
                  </span>
                  <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
                    {cp.category}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text)]">{cp.title}</span>
                  {state === "expired" && <span className="flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300"><AlertTriangle size={10} /> 만료됨</span>}
                  {state === "soon" && <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"><CalendarClock size={10} /> 곧 만료</span>}
                  {dirtyCheckpoints.has(cp.id) && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">수정됨</span>}
                  <button disabled={cpBusy || !userId} onClick={() => {
                    setEditingCheckpoint(cp);
                    setEditView("write");
                    setCpEditDraft({ title: cp.title, category: cp.category || "general", markdown: cp.learned_from ?? (cp.checklist ?? []).map((item) => `- ${item}`).join("\n"), expiresAt: cp.expires_at?.slice(0, 10) ?? "" });
                  }} className="shrink-0 rounded border border-cyan-500/40 px-1.5 py-0.5 text-[10.5px] text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40">수정</button>
                  <button
                    disabled={cpBusy || !userId}
                    onClick={async () => {
                      setCpBusy(true);
                      try {
                        await deleteWorkspaceCheckpoint(userId!, workspace, cp.id);
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
                {(cp.learned_from || (cp.checklist?.length ?? 0) > 0) && (
                  <div
                    className="md-body md-body-compact max-h-28 overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: renderMd(cp.learned_from || cp.checklist!.map((item) => `- ${item}`).join("\n")) }}
                  />
                )}
                <div className="mt-2 font-mono text-[10.5px] text-[var(--color-text-dim)]">
                  {cp.applies_to?.length ? cp.applies_to.join(", ") : "워크스페이스 전체 프로젝트"} → .claude/rules/{cp.category || "general"}/
                </div>
                {cp.expires_at ? (
                  <div className={`mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${expiryTone}`}>
                    <CalendarClock size={13} className="shrink-0" />
                    <span className="text-[10px] font-semibold opacity-75">유효기간</span>
                    <span className="font-mono text-[12px] font-bold tracking-wide">{cp.expires_at.slice(0, 10)}까지</span>
                    <span className="text-[9.5px] opacity-60">KST</span>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-[10.5px] text-[var(--color-text-dim)]">
                    <CalendarClock size={11} /> 유효기간 없음
                  </div>
                )}
              </div>
              );
            })}
            {visibleCheckpoints.length > CHECKPOINTS_PER_PAGE && (
              <div className="flex items-center justify-between pt-1 text-[11.5px] text-[var(--color-text-muted)]">
                <button
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded border border-[var(--color-border)] px-2.5 py-1 hover:text-cyan-300 disabled:opacity-30"
                >
                  ← 이전
                </button>
                <span className="font-mono">{safePage + 1} / {pageCount} · 총 {visibleCheckpoints.length}개</span>
                <button
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="rounded border border-[var(--color-border)] px-2.5 py-1 hover:text-cyan-300 disabled:opacity-30"
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
        )}
        {/* 워크스페이스 단위 체크포인트 편집·일괄 적용. */}
        <div className="mt-5 border-t border-[var(--color-border)] pt-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div><div className="text-[16px] font-semibold text-[var(--color-text-bright)]">새 규칙 작성</div><p className="mt-1 text-[12px] text-[var(--color-text-muted)]">작성할 규칙의 이름과 저장 위치를 먼저 정합니다.</p></div>
            <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-1 text-[10.5px] font-medium text-amber-200">체크포인트</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-[210px_minmax(0,1fr)]">
              <label className="bg-[var(--color-surface)] px-4 py-3"><span className="text-[11px] font-medium text-[var(--color-text-dim)]">규칙 폴더</span><input value={cpDraft.category} onChange={(e) => setCpDraft({ ...cpDraft, category: e.target.value })} placeholder="general" className="mt-1.5 w-full bg-transparent font-mono text-[13px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]" /></label>
              <label className="bg-[var(--color-surface)] px-4 py-3"><span className="text-[11px] font-medium text-[var(--color-text-dim)]">규칙 이름</span><input value={cpDraft.title} onChange={(e) => setCpDraft({ ...cpDraft, title: e.target.value })} placeholder="예: API 호출 실패 시 재시도 기준" className="mt-1.5 w-full bg-transparent text-[14px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]" /></label>
            </div>
            <MarkdownEditor value={cpDraft.markdown} onChange={(markdown) => setCpDraft({ ...cpDraft, markdown })} />
            <div className="flex flex-wrap items-end justify-between gap-4 border-t border-[var(--color-border)] px-4 py-3.5">
              <div><div className="text-[11px] font-medium text-[var(--color-text-dim)]">적용 기간</div><div className="mt-2 flex flex-wrap items-center gap-2"><div className="w-44">
                <DatePicker
                  value={cpDraft.expiresAt || null}
                  onChange={(expiresAt) => setCpDraft({ ...cpDraft, expiresAt: expiresAt ?? "" })}
                  placeholder="만료 없음"
                  ariaLabel="새 체크포인트 유효기간"
                />
              </div>
              {defaultExpiresAt && (
                <button
                  type="button"
                  aria-pressed={cpDraft.expiresAt === defaultExpiresAt}
                  onClick={() => setCpDraft({ ...cpDraft, expiresAt: defaultExpiresAt })}
                  className={`rounded border px-2 py-1.5 text-[10.5px] transition-colors ${cpDraft.expiresAt === defaultExpiresAt ? "border-cyan-400/60 bg-cyan-400/15 font-semibold text-cyan-200" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-cyan-500/30 hover:text-cyan-300"}`}
                >
                  SPEC 마감일까지
                </button>
              )}
              <button
                type="button"
                aria-pressed={!cpDraft.expiresAt}
                onClick={() => setCpDraft({ ...cpDraft, expiresAt: "" })}
                className={`flex items-center gap-1 rounded border px-2 py-1.5 text-[10.5px] transition-colors ${!cpDraft.expiresAt ? "border-cyan-400/60 bg-cyan-400/15 font-semibold text-cyan-200" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-cyan-500/30 hover:text-cyan-300"}`}
              >
                {!cpDraft.expiresAt && <Check size={12} />} 만료 없음
              </button>
              </div></div>
              <button
            disabled={cpBusy || !cpDraft.title.trim() || !cpDraft.markdown.trim() || !userId}
            onClick={async () => {
              setCpBusy(true);
              try {
                const saved = await createWorkspaceCheckpoint(userId!, workspace, {
                  category: cpDraft.category.trim() || "general",
                  title: cpDraft.title.trim(),
                  learnedFrom: cpDraft.markdown,
                  appliesTo: defaultAppliesTo,
                  expiresAt: cpDraft.expiresAt || null,
                });
                setDirtyCheckpoints((current) => new Set(current).add(saved.id));
                setCpDraft({ title: "", category: "general", markdown: "", expiresAt: "" });
                checkpoints.refresh();
              } finally {
                setCpBusy(false);
              }
            }}
            className="rounded-lg border border-amber-400/45 bg-amber-400/10 px-4 py-2 text-[12px] font-bold text-amber-200 transition-colors hover:bg-amber-400/20 disabled:opacity-40"
          >
            체크포인트 저장
              </button>
            </div>
          </div>
          <button disabled={cpBusy || checkpoints.data.length === 0 || !userId} onClick={async () => {
            setCpBusy(true);
            try {
              const result = await applyWorkspaceCheckpoints(userId!, workspace);
              setCpApplyResult(result);
              setDirtyCheckpoints((current) => new Set([...current].filter((id) => !result.appliedIds.includes(id))));
            } finally { setCpBusy(false); }
          }} className="mt-3 w-full rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-500/12 to-orange-500/[0.05] px-4 py-2.5 text-[13px] font-bold text-amber-200 hover:border-amber-300 disabled:opacity-40">저장 후 적용 · 전체 프로젝트</button>
          {cpApplyResult && <div className={`rounded-lg border p-2.5 text-[11px] ${cpApplyResult.conflicts.length || cpApplyResult.failed.length ? "border-amber-400/35 bg-amber-400/[0.06] text-amber-100" : "border-emerald-400/30 bg-emerald-400/[0.05] text-emerald-200"}`}>
            <div className="font-semibold">{workspace} 적용 결과 · 변경된 체크포인트 {cpApplyResult.changedCheckpoints}건 · 파일 {cpApplyResult.filesWritten}개 적용 · {cpApplyResult.filesRemoved}개 정리</div>
            {cpApplyResult.expiredCheckpoints > 0 && <div className="mt-1 text-rose-200">만료 체크포인트 {cpApplyResult.expiredCheckpoints}건은 컨텍스트에서 제외했습니다.</div>}
            <div className="mt-1">충돌 {cpApplyResult.conflicts.length} · 실패 {cpApplyResult.failed.length}</div>
            {cpApplyResult.conflicts.map((item) => <div key={`${item.id}:${item.file}`} className="mt-1 text-[10px]"><div className="font-mono">충돌: {item.file}</div><div className="mt-0.5 opacity-70">{item.reason}</div></div>)}
          </div>}
        </div>
        </div>
      </Modal>

      {editingCheckpoint && (
        <div className="checkpoint-panel fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingCheckpoint(null); }}>
          <div className="flex h-[72vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-[var(--color-surface)] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4"><div className="min-w-0 flex-1"><div className="font-mono text-[10px] text-cyan-300">{editingCheckpoint.id}</div><div className="text-[16px] font-semibold">체크포인트 수정</div></div><button onClick={() => setEditingCheckpoint(null)}>✕</button></div>
            <div className="grid grid-cols-[160px_1fr_270px] gap-3 border-b border-[var(--color-border)] p-4"><input value={cpEditDraft.category} onChange={(e) => setCpEditDraft({ ...cpEditDraft, category: e.target.value })} placeholder="규칙 폴더" className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-[12px]" /><input value={cpEditDraft.title} onChange={(e) => setCpEditDraft({ ...cpEditDraft, title: e.target.value })} placeholder="제목" className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px]" /><div className="text-[10px] text-[var(--color-text-dim)]">유효기간<div className="mt-1 flex items-center gap-2"><div className="min-w-0 flex-1"><DatePicker value={cpEditDraft.expiresAt || null} onChange={(expiresAt) => setCpEditDraft({ ...cpEditDraft, expiresAt: expiresAt ?? "" })} placeholder="만료 없음" ariaLabel="체크포인트 유효기간 수정" /></div><button type="button" onClick={() => setCpEditDraft({ ...cpEditDraft, expiresAt: "" })} disabled={!cpEditDraft.expiresAt} className="shrink-0 rounded border border-[var(--color-border)] px-2 py-1.5 text-[10.5px] text-[var(--color-text-muted)] hover:text-cyan-300 disabled:cursor-default disabled:opacity-40">만료 없음</button></div></div></div>
            <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] px-4 pt-2 text-[11px] font-semibold">
              <button type="button" onClick={() => setEditView("write")} className={`flex items-center gap-1 rounded-t-md px-3 py-1.5 transition-colors ${editView === "write" ? "border-x border-t border-[var(--color-border)] bg-[#070b12] text-cyan-300" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"}`}>
                <Pencil size={11} /> 작성
              </button>
              <button type="button" onClick={() => setEditView("preview")} className={`flex items-center gap-1 rounded-t-md px-3 py-1.5 transition-colors ${editView === "preview" ? "border-x border-t border-[var(--color-border)] bg-[#070b12] text-cyan-300" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"}`}>
                <Eye size={11} /> 미리보기
              </button>
            </div>
            {editView === "write" ? (
              <textarea autoFocus value={cpEditDraft.markdown} onChange={(e) => setCpEditDraft({ ...cpEditDraft, markdown: e.target.value })} className="ck-scroll min-h-0 flex-1 resize-none bg-[#070b12] p-5 font-mono text-[12.5px] leading-6 text-slate-200 outline-none" placeholder={"Markdown 문법으로 작성하세요 — # 제목, - 목록, **굵게** 등"} />
            ) : (
              <div className="md-body ck-scroll min-h-0 flex-1 overflow-y-auto bg-[#070b12] p-5">
                {cpEditDraft.markdown.trim() ? <div dangerouslySetInnerHTML={{ __html: renderMd(cpEditDraft.markdown) }} /> : <p className="text-[var(--color-text-dim)]">아직 내용이 없습니다.</p>}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3"><button onClick={() => setEditingCheckpoint(null)} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12px]">취소</button><button disabled={cpBusy || !cpEditDraft.title.trim() || !cpEditDraft.markdown.trim()} onClick={async () => { setCpBusy(true); try { await updateWorkspaceCheckpoint(userId!, workspace, editingCheckpoint.id, { title: cpEditDraft.title.trim(), category: cpEditDraft.category.trim() || "general", learnedFrom: cpEditDraft.markdown, appliesTo: editingCheckpoint.applies_to ?? defaultAppliesTo, expiresAt: cpEditDraft.expiresAt || null }); setDirtyCheckpoints((current) => new Set(current).add(editingCheckpoint.id)); checkpoints.refresh(); setEditingCheckpoint(null); } finally { setCpBusy(false); } }} className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-[12px] font-bold text-cyan-200">수정 저장</button></div>
          </div>
        </div>
      )}
    </>
  );
}
