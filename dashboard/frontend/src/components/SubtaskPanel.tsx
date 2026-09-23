import { useEffect, useState } from "react";
import { Check, Copy, GitPullRequest, Sparkles } from "lucide-react";
import { useAuth } from "../auth/AuthContext.js";
import { parseWorkResult, type RoadmapNode, type WorkResultFile } from "../hooks/useRoadmap.js";
import { clearManualStatus, setManualStatus } from "../api/roadmapMutationsApi.js";
import { checkExistingPr, createPr, type PrRef, type PrScope } from "../api/prApi.js";
import { inspectorProgress, type InspectorProgress } from "./roadmap/inspectorModel.js";
import { fileViewerPresentation } from "./roadmap/fileViewerModel.js";

type Tab = "progress" | "summary" | "files";

function scopeForLevel(level: string): PrScope {
  if (level === "spec") return "spec";
  if (level === "workstream") return "run";
  return "task";
}

function fileBadge(change: WorkResultFile["change"]): string {
  if (change === "added") return "A";
  if (change === "deleted") return "D";
  return "M";
}

function fileBadgeColor(change: WorkResultFile["change"]): string {
  if (change === "added") return "#10b981";
  if (change === "deleted") return "#ef4444";
  return "#f59e0b";
}

// §5 SubtaskPanel(폭 420, 탭 progress/summary/files).
// WorkResult 메타·수동 done/취소·PR 패널은 progress 탭에 있다.
export function SubtaskPanel({
  workspace,
  node,
  reqs: reqsProp,
  children: childrenProp,
  onClose,
  onChanged,
  onOpenFile,
  scopeFiles,
}: {
  workspace: string;
  node: RoadmapNode;
  /** 이 노드의 REQ(subtask) 자식들. **그래프가 아니라 여기서 보여주는 게 정본이다**(설계안). */
  reqs?: RoadmapNode[];
  /** SPEC의 RUN, RUN의 TASK. TASK 진행률은 reqs를 사용한다. */
  children?: RoadmapNode[];
  onClose: () => void;
  onChanged: () => void;
  onOpenFile: (file: WorkResultFile, expanded?: boolean) => void;
  /** SPEC/RUN은 하위 작업 전체의 변경 파일을 합친 scope 결과를 받는다. */
  scopeFiles?: WorkResultFile[];
}) {
  const { userId } = useAuth();
  const [tab, setTab] = useState<Tab>("progress");
  const reqs = reqsProp ?? [];
  const progressItems = node.level === "task" ? reqs : (childrenProp ?? []);
  const progress = inspectorProgress(node, progressItems);

  useEffect(() => setTab("progress"), [node.id]);

  const workResult = parseWorkResult(node.work_result);
  const files = scopeFiles ?? workResult?.files ?? [];

  return (
    <aside className="flex min-h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--color-surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-md bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              {node.level === "workstream" ? "RUN" : node.level}
            </span>
            <span className="font-mono text-[10px] uppercase text-[var(--color-text-dim)]">{node.status}</span>
          </div>
          <div className="truncate text-[15px] font-semibold text-[var(--color-text-bright)]">{node.title}</div>
          <div className="mt-1 truncate font-mono text-[10px] text-[var(--color-text-dim)]" title={node.id}>
            {node.id}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-xs opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>

      <div className="flex border-b border-white/10 text-xs">
        {(["progress", "summary", "files"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 ${tab === t ? "ck-glow-cyan" : "opacity-60 hover:opacity-100"}`}
          >
            {t === "progress"
              ? `개요 · ${progress.label} ${progress.done}/${progress.total}`
              : t === "summary"
                ? "작업 요약"
                : `변경 파일 ${files.length}`}
          </button>
        ))}
      </div>

      <div className="ck-scroll flex-1 space-y-4 p-3 text-sm">
        {tab === "progress" && (
          <ProgressTab
            userId={userId}
            workspace={workspace}
            node={node}
            workResult={workResult}
            progress={progress}
            progressItems={progressItems}
            onChanged={onChanged}
          />
        )}
        {tab === "summary" && <SummaryTab summary={workResult?.summary} />}
        {tab === "files" && <FilesTab files={files} onOpenFile={onOpenFile} aggregated={node.level === "spec" || node.level === "workstream"} />}
      </div>
    </aside>
  );
}

function durationLabel(startedAt?: string, endedAt?: string): string | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  return `${minutes}분`;
}

function ProgressTab({
  userId,
  workspace,
  node,
  workResult,
  progress,
  progressItems,
  onChanged,
}: {
  userId: string | null;
  workspace: string;
  node: RoadmapNode;
  workResult: ReturnType<typeof parseWorkResult>;
  progress: InspectorProgress;
  progressItems: RoadmapNode[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [patchCopied, setPatchCopied] = useState(false);
  const [showPr, setShowPr] = useState(false);

  async function handleManualDone() {
    if (!userId) return;
    setBusy(true);
    try {
      await setManualStatus(userId, workspace, node.id, "done");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelManual() {
    if (!userId) return;
    setBusy(true);
    try {
      await clearManualStatus(userId, workspace, node.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function handleCopyPatchBridge() {
    if (!workResult?.path) return;
    const cmd = `/sugo:patch ${workResult.path}`;
    void navigator.clipboard?.writeText(cmd);
    setPatchCopied(true);
    window.setTimeout(() => setPatchCopied(false), 1800);
  }

  const duration = durationLabel(workResult?.startedAt, workResult?.endedAt);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">실제 진행</div>
            <div className="mt-1 text-[12px] text-[var(--color-text-muted)]">{progress.label} 기준</div>
          </div>
          <div className="font-mono text-xl font-semibold text-cyan-300">
            {progress.done}<span className="text-sm text-[var(--color-text-dim)]">/{progress.total}</span>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
            style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
      </div>

      {progressItems.length > 0 && (node.level === "task" ? <ReqList reqs={progressItems} /> : <ChildList items={progressItems} />)}

      <div className="space-y-1">
        <div className="font-mono text-xs uppercase opacity-60">Work Result</div>
        {workResult ? (
          <div className="space-y-1 text-xs">
            {workResult.model && <div>model: {workResult.model}</div>}
            {duration && <div>소요: {duration}</div>}
            {workResult.seed && <div>seed: {workResult.seed}</div>}
            <div className="flex gap-2 pt-1">
              {workResult.runtimeVerified && (
                <span className="rounded px-2 py-0.5" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                  runtime ✓
                </span>
              )}
              {workResult.wiringVerified && (
                <span className="rounded px-2 py-0.5" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                  wiring ✓
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs opacity-50">아직 work_result 없음</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(node.level === "task" || node.level === "workstream") && (node.manual_status ?? node.status) === "done" && workResult?.path && (
          <button type="button" onClick={handleCopyPatchBridge} className="group rounded-xl border border-violet-400/45 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/[0.06] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-violet-300/70 hover:shadow-[0_0_24px_rgba(139,92,246,0.14)]">
            <span className="flex items-center gap-2 text-sm font-semibold text-violet-200"><Sparkles size={16} /> Patch 이어가기</span>
            <span className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-violet-200/60">{patchCopied ? <><Check size={12} /> 명령어 복사됨</> : <><Copy size={12} /> 완료 산출물에서 다음 차수 시작</>}</span>
          </button>
        )}
        <button type="button" onClick={() => setShowPr((value) => !value)} className="group rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-blue-500/[0.05] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/70 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)]">
          <span className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><GitPullRequest size={16} /> PR 생성하기</span>
          <span className="mt-1.5 block text-[10.5px] text-cyan-200/60">{showPr ? "입력 닫기" : "제목·대상 브랜치 설정"}</span>
        </button>
      </div>

      {showPr && <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.035] p-3"><PrPanel workspace={workspace} node={node} /></div>}

      {(node.level === "task" && (node.manual_status ?? node.status) !== "done") || node.manual_status ? (
        <details className="rounded-lg border border-[var(--color-border)] bg-black/10 p-2.5">
          <summary className="cursor-pointer font-mono text-[11px] uppercase text-[var(--color-text-muted)]">상태 관리</summary>
          <div className="mt-3 flex flex-wrap gap-2">
          {node.level === "task" && (node.manual_status ?? node.status) !== "done" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleManualDone()}
            className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/5"
          >
            수동 완료
          </button>
          )}
          {node.manual_status && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCancelManual()}
              className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/5"
            >
              취소
            </button>
          )}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PrPanel({ workspace, node }: { workspace: string; node: Pick<RoadmapNode, "id" | "level"> }) {
  const [scope, setScope] = useState<PrScope>(scopeForLevel(node.level));
  const [targetBranch, setTargetBranch] = useState("develop");
  const [title, setTitle] = useState("");
  const [pr, setPr] = useState<PrRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkExistingPr({ workspace, nodeId: node.id, scope, targetBranch })
      .then((res) => {
        if (cancelled) return;
        setPr(res.pr ?? null);
        setError(res.exists ? null : res.error ?? null);
      })
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [workspace, node.id, scope, targetBranch]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const res = await createPr({ workspace, nodeId: node.id, scope, title: title || undefined, targetBranch });
      if (res.pr) {
        setPr(res.pr);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="font-mono text-xs uppercase text-cyan-200/70">Pull Request 설정</div>
      <div className="flex gap-2">
        <select value={scope} onChange={(e) => setScope(e.target.value as PrScope)} className="rounded bg-white/5 px-2 py-1 text-xs">
          <option value="task">task</option>
          <option value="run">run</option>
          <option value="spec">spec</option>
        </select>
        <input
          value={targetBranch}
          onChange={(e) => setTargetBranch(e.target.value)}
          placeholder="target branch"
          className="w-24 rounded bg-white/5 px-2 py-1 text-xs"
        />
      </div>
      {pr ? (
        <a href={pr.url} target="_blank" rel="noreferrer" className="block text-xs" style={{ color: "var(--color-primary)" }}>
          PR #{pr.id} 열기 →
        </a>
      ) : (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="PR 제목 (선택)"
            className="w-full rounded bg-white/5 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCreate()}
            className="ck-glow-cyan rounded px-3 py-1 text-xs"
            style={{ border: "1px solid var(--color-primary)" }}
          >
            PR 생성
          </button>
          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
      )}
    </div>
  );
}

function SummaryTab({ summary }: { summary?: string }) {
  if (!summary) return <div className="rounded-lg border border-dashed border-white/10 p-4 text-xs text-[var(--color-text-dim)]">아직 기록된 작업 요약이 없습니다.</div>;
  // §5는 "마크다운 summary"라고 하지만 여기선 원문을 그대로 렌더한다(마크다운 파싱 없음).
  // 렌더러가 필요하면 Harness.tsx가 쓰는 marked를 그대로 붙이면 된다.
  return <pre className="whitespace-pre-wrap font-sans text-xs">{summary}</pre>;
}

function ChildList({ items }: { items: RoadmapNode[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const done = (item.manual_status ?? item.status) === "done";
        return (
          <div key={item.id} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2">
            <span className={done ? "text-emerald-400" : "text-cyan-300"}>{done ? "✓" : "○"}</span>
            <span className="min-w-0 flex-1 truncate text-[12px]" title={item.title}>{item.title}</span>
            <span className="font-mono text-[9px] uppercase text-[var(--color-text-dim)]">{item.level === "workstream" ? "RUN" : item.level}</span>
          </div>
        );
      })}
    </div>
  );
}

function FilesTab({ files, onOpenFile, aggregated = false }: { files: WorkResultFile[]; onOpenFile: (file: WorkResultFile, expanded?: boolean) => void; aggregated?: boolean }) {
  const [selected, setSelected] = useState<WorkResultFile | null>(null);
  if (files.length === 0) return <div className="text-xs opacity-50">변경된 파일 없음</div>;
  return (
    <div className="flex min-h-0 flex-col gap-2">
      {aggregated && (
        <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.035] px-2.5 py-2 text-[10.5px] leading-relaxed text-cyan-100/60">
          이 범위에 속한 하위 RUN/TASK의 변경 파일을 합쳐서 보여줍니다. 같은 경로는 최신 산출물 기준입니다.
        </div>
      )}
      <ul className="space-y-1">
        {files.map((f) => {
          const presentation = fileViewerPresentation(f.path);
          return (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => {
                setSelected(f);
                onOpenFile(f, false);
              }}
              onDoubleClick={() => {
                setSelected(f);
                onOpenFile(f, true);
              }}
              className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors hover:border-cyan-400/25 hover:bg-white/5 ${
                selected?.path === f.path ? "border-cyan-400/30 bg-cyan-400/[0.06]" : "border-transparent"
              }`}
              title="클릭: 하단에서 보기 · 더블클릭: 전체화면"
            >
              <span className="font-mono" style={{ color: fileBadgeColor(f.change) }}>
                {fileBadge(f.change)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] text-[var(--color-text)]">{f.path}</span>
                <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wide text-[var(--color-text-dim)]">{presentation.eyebrow}</span>
              </span>
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * REQ(subtask) 목록 — 설계안에서 REQ는 **그래프 노드가 아니라 이 패널**에 산다.
 *
 * `{taskId}::REQ-CONFIRM`(사용자 최종확인)은 §9상 **에이전트가 못 닫고 사람의 review_done으로만**
 * 완료되는 노드라, 다른 REQ와 구분해 표시한다 — 이게 섞이면 "AI가 다 끝냈다"로 잘못 읽힌다.
 */
function ReqList({ reqs }: { reqs: RoadmapNode[] }) {
  return (
    <div className="space-y-1">
      {reqs.map((r) => {
        const st = (r.manual_status ?? r.status ?? "pending").toLowerCase();
        const isConfirm = r.id.endsWith("::REQ-CONFIRM");
        const done = st === "done";
        return (
          <div
            key={r.id}
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${
              isConfirm ? "border-amber-500/30 bg-amber-500/5" : "border-[var(--color-border)] bg-[var(--color-background)]"
            }`}
          >
            <span className={`shrink-0 text-[12px] ${done ? "text-emerald-400" : "text-[var(--color-text-dim)]"}`}>
              {done ? "✓" : st === "in_progress" ? "◐" : "○"}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-[12.5px] ${
                done ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"
              }`}
              title={r.title}
            >
              {r.title}
            </span>
            {isConfirm && (
              <span className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 font-mono text-[9.5px] text-amber-300">
                사용자 확인
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
