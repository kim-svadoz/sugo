import { workflowStatus } from "../lib/workflowStatus.js";
import { CompletionApprovalPanel } from "./CompletionApprovalPanel.js";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, GitPullRequest, Sparkles } from "lucide-react";
import { useAuth } from "../auth/AuthContext.js";
import { parseWorkResult, type RoadmapNode, type WorkResultFile } from "../hooks/useRoadmap.js";
import { clearManualStatus, getReviewArtifact, setManualStatus } from "../api/roadmapMutationsApi.js";
import { checkExistingPr, createPr, type PrRef, type PrScope } from "../api/prApi.js";
import { inspectorProgress, type InspectorProgress } from "./roadmap/inspectorModel.js";
import { fileViewerPresentation, reviewArtifactLocator } from "./roadmap/fileViewerModel.js";
import { workResultPresentation } from "./roadmap/workResultPresentation.js";
import { taskGuidance } from "../lib/taskGuidance.js";
import { workResultSummaryHtml } from "../lib/workResultSummaryHtml.js";
import { BlockerDecisionPanel } from "./BlockerDecisionPanel.js";
import type { ReviewPacket } from "../lib/reviewConfirmation.js";

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
  requirementsUnavailable = false,
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
  requirementsUnavailable?: boolean;
}) {
  const { userId } = useAuth();
  const [tab, setTab] = useState<Tab>("progress");
  const reqs = reqsProp ?? [];
  const workResult = parseWorkResult(node.work_result);
  const progressItems = useMemo(() => {
    const items = node.level === "task" ? reqs : (childrenProp ?? []);
    if (node.level !== "task" || !workResult?.report) return items;
    return items.map((item) => item.id.endsWith("::REQ-CONFIRM")
      ? { ...item, status: workResult.report!.completionGrade === "unverified" ? "pending" : "done", manual_status: null }
      : item);
  }, [childrenProp, node.level, reqs, workResult?.report]);
  const progress = inspectorProgress(node, progressItems);

  useEffect(() => setTab("progress"), [node.id]);

  const reviewPacket = node.human_blocker?.kind === "review_confirmation" ? node.human_blocker.reviewPacket : undefined;
  const files = scopeFiles ?? workResult?.files ?? reviewPacket?.files ?? [];

  return (
    <aside className="flex min-h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--color-surface)]">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-md bg-cyan-400/10 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
              {node.level === "workstream" ? "RUN" : node.level}
            </span>
            <span className="font-mono text-[11px] uppercase text-[var(--color-text-dim)]">{workflowStatus(node) === "verification" ? "검증" : workflowStatus(node)}</span>
          </div>
          <div className="whitespace-normal break-words text-lg font-semibold leading-snug text-[var(--color-text-bright)]">{node.title}</div>
          <div className="mt-1.5 truncate font-mono text-[11px] text-[var(--color-text-dim)]" title={node.id}>
            {node.id}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-sm opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>

      <div className="flex border-b border-white/10 text-sm">
        {(["progress", "summary", "files"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 ${tab === t ? "ck-glow-cyan" : "opacity-60 hover:opacity-100"}`}
          >
            {t === "progress"
              ? requirementsUnavailable ? "개요 · REQ 기록 없음" : `개요 · ${progress.label} ${progress.done}/${progress.total}`
              : t === "summary"
                ? "작업 요약"
                : `변경 파일 ${files.length}`}
          </button>
        ))}
      </div>

      <div className="ck-scroll flex-1 space-y-5 p-4 text-[15px]">
        {tab === "progress" && (
          <ProgressTab
            userId={userId}
            workspace={workspace}
            node={node}
            workResult={workResult}
            progress={progress}
            progressItems={progressItems}
            requirementsUnavailable={requirementsUnavailable}
            onChanged={onChanged}
            onReviewResult={() => setTab("summary")}
          />
        )}
        {tab === "summary" && <SummaryTab title={node.title} workResult={workResult} reviewPacket={reviewPacket} requirements={node.level === "task" ? progressItems : []} />}
        {tab === "files" && <FilesTab userId={userId} workspace={workspace} taskId={node.ref ?? node.id.replace(/:v\d+$/, "")} sessionId={node.human_blocker?.sessionId} patchVersion={workResult?.patchVersion} files={files} onOpenFile={onOpenFile} aggregated={node.level === "spec" || node.level === "workstream"} />}
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
  requirementsUnavailable,
  onChanged,
  onReviewResult,
}: {
  userId: string | null;
  workspace: string;
  node: RoadmapNode;
  workResult: ReturnType<typeof parseWorkResult>;
  progress: InspectorProgress;
  progressItems: RoadmapNode[];
  requirementsUnavailable: boolean;
  onChanged: () => void;
  onReviewResult: () => void;
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
  const reportView = workResult ? workResultPresentation(workResult.report ?? workResult) : null;
  const guidance = node.level === "task" ? taskGuidance(node) : null;

  function handlePrimaryAction() {
    if (!guidance) return;
    if (guidance.action === "open_review_confirmation") {
      const panel = document.querySelector<HTMLElement>("#review-confirmation-panel");
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      panel?.focus({ preventScroll: true });
    }
    if (guidance.action === "review_verification") document.querySelector<HTMLButtonElement>("#completion-review [data-review-open]")?.click();
    if (guidance.action === "review_result") onReviewResult();
    if (guidance.action === "continue_patch") handleCopyPatchBridge();
    if (guidance.action === "create_pr") setShowPr(true);
  }

  const actionable = guidance && ["open_review_confirmation", "review_verification", "review_result", "continue_patch", "create_pr"].includes(guidance.action);

  const resultSection = (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-dim)]">Work Result</div>
          {reportView && <span className="font-mono text-[11px] text-violet-200/70">{reportView.versionLabel}</span>}
        </div>
        {workResult && reportView ? (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.045] to-transparent">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div className="flex items-center gap-2">
                {reportView.grade === "unverified" ? <AlertTriangle size={16} className="text-amber-300" /> : <CheckCircle2 size={16} className="text-emerald-300" />}
                <span className={`text-sm font-semibold ${reportView.grade === "unverified" ? "text-amber-200" : "text-[var(--color-text)]"}`}>{reportView.grade === "unverified" ? "사용자 확인 필요" : "작업 결과"}</span>
              </div>
              {duration && <span className="font-mono text-[11px] text-[var(--color-text-dim)]">{duration}</span>}
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/5 text-[12px]">
              <div className="bg-[var(--color-surface)] px-4 py-3"><span className="text-[var(--color-text-dim)]">테스트</span><div className="mt-1 font-medium text-[var(--color-text)]">{reportView.testLabel ?? "기록 없음"}</div></div>
              <div className="bg-[var(--color-surface)] px-4 py-3"><span className="text-[var(--color-text-dim)]">실행 검증</span><div className="mt-1 font-medium text-[var(--color-text)]">{reportView.runtimeVerified ? "runtime ✓" : "미검증"}{reportView.wiringVerified ? " · wiring ✓" : ""}</div></div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 p-3 text-xs opacity-50">아직 work_result 없음</div>
        )}
      </div>

  );

  return (
    <div className="space-y-4">
      {resultSection}
      {guidance && node.human_blocker?.kind !== "review_confirmation" && guidance.kind !== "done" && guidance.kind !== "verification" && (
        <section className={`overflow-hidden rounded-xl border ${guidance.kind === "blocked" ? "border-orange-400/40 bg-orange-400/[0.06]" : guidance.kind === "attention" ? "border-amber-400/35 bg-amber-400/[0.05]" : "border-cyan-400/30 bg-cyan-400/[0.045]"}`}>
          <div className="border-b border-white/[0.07] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-dim)]">지금 할 일</div>
          <div className="space-y-2.5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] text-[var(--color-text-dim)]">현재 단계</div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--color-text-bright)]">{guidance.currentStage}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[9.5px] font-semibold ${guidance.kind === "blocked" ? "bg-orange-400/15 text-orange-300" : guidance.kind === "attention" ? "bg-amber-400/15 text-amber-300" : "bg-cyan-400/10 text-cyan-300"}`}>{guidance.label}</span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">{guidance.reason}</p>
            <div className="rounded-lg border border-white/[0.07] bg-black/15 px-2.5 py-2">
              <div className="text-[9.5px] text-[var(--color-text-dim)]">다음 단계</div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-cyan-200">{guidance.nextAction}</div>
            </div>
            {guidance.kind === "blocked" && <p className="text-[10.5px] leading-relaxed text-orange-200/70">{guidance.blockedNextStep}</p>}
            {actionable && (
              <button type="button" onClick={handlePrimaryAction} className="w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/20">
                {guidance.nextAction}
              </button>
            )}
          </div>
        </section>
      )}
      {node.level === "task" && (node.manual_status ?? node.status) === "blocked" && (
        <BlockerDecisionPanel
          userId={userId}
          workspace={workspace}
          taskId={node.ref ?? node.id.replace(/:v\d+$/, "")}
          taskTitle={node.title}
          question={node.note}
          decision={node.blocker_decision}
          blocker={node.human_blocker}
          onSaved={onChanged}
          onOpenReport={() => openWorkResultHtml(node.title, workResult, progressItems, node.human_blocker?.reviewPacket)}
        />
      )}
      {requirementsUnavailable ? (
        <div className="rounded-lg border border-[var(--color-border)] p-3 text-[12px] text-[var(--color-text-muted)]">이 차수의 REQ 기록이 없습니다.</div>
      ) : <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">실제 진행</div>
            <div className="mt-1 text-sm text-[var(--color-text-muted)]">{progress.label} 기준</div>
          </div>
          <div className="font-mono text-2xl font-semibold text-cyan-300">
            {progress.done}<span className="text-base text-[var(--color-text-dim)]">/{progress.total}</span>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
            style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
      </div>}

      {progressItems.length > 0 && (node.level === "task" ? <ReqList reqs={progressItems} workspace={workspace} node={node} onChanged={onChanged} /> : <ChildList items={progressItems} />)}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(node.level === "task" || node.level === "workstream") && (node.manual_status ?? node.status) === "done" && workResult?.path && (
          <button type="button" onClick={handleCopyPatchBridge} className="group flex min-h-[108px] flex-col rounded-xl border border-violet-400/45 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/[0.06] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-violet-300/70 hover:shadow-[0_0_24px_rgba(139,92,246,0.14)]">
            <span className="flex items-center gap-2 text-base font-semibold text-violet-200"><Sparkles size={18} /> Patch 이어가기</span>
            <span className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-violet-200/60">{patchCopied ? <><Check size={14} /> 명령어 복사됨</> : <><Copy size={14} /> 완료 산출물로 후속 작업</>}</span>
          </button>
        )}
        <button type="button" onClick={() => setShowPr((value) => !value)} className="group flex min-h-[108px] flex-col rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-blue-500/[0.05] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/70 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)]">
          <span className="flex items-center gap-2 text-base font-semibold text-cyan-200"><GitPullRequest size={18} /> PR 생성하기</span>
          <span className="mt-auto block pt-2 text-xs text-cyan-200/60">{showPr ? "입력 닫기" : "제목·대상 브랜치 설정"}</span>
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
  const errorLabel = error === "NO_CONNECTION"
    ? "이 저장소의 Git 서비스가 연결되지 않았습니다. Settings에서 필요한 공급자만 연결하세요."
    : error === "PROVIDER_NOT_AVAILABLE"
      ? "이 Git 공급자의 PR 자동 생성은 아직 지원하지 않습니다."
      : error === "BRANCH_NOT_PUSHED"
        ? "원격 저장소에 작업 브랜치를 먼저 push해야 합니다."
        : error;

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
          {errorLabel && <div className="text-xs leading-relaxed text-red-400">{errorLabel}</div>}
        </div>
      )}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function requirementTitle(value: string): string {
  return value.replace(/\s*\(TODO-SPEC\s*항목:\s*[^)]+\)\s*$/i, "").trim();
}

function reportList(items: string[], empty: string): string {
  const values = items.length ? items : [empty];
  return `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function openWorkResultHtml(title: string, workResult: ReturnType<typeof parseWorkResult>, requirements: RoadmapNode[], reviewPacket?: ReviewPacket) {
  const patchVersion = Number(title.match(/^v(\d+)\s/)?.[1] ?? 0);
  const effectiveResult = reviewPacket ? { summary: reviewPacket.summary, patchVersion: reviewPacket.report?.patchVersion ?? patchVersion, report: reviewPacket.report, files: reviewPacket.files } : workResult;
  if (!effectiveResult) return;
  const view = workResultPresentation(effectiveResult.report ?? effectiveResult);
  const report = effectiveResult.report;
  if (!requirements.length && report?.requirements?.length) requirements = report.requirements.map(req => ({ id: req.id, title: req.id, status: req.covered ? "done" : "pending" } as RoadmapNode));
  const files = effectiveResult.files?.map((file) => `${file.change.toUpperCase()} · ${file.path}`) ?? report?.changedFiles ?? reviewPacket?.changes ?? [];
  const decisions = report?.designDecisions ?? reviewPacket?.designDecisions ?? [];
  const risks = report?.knownLimitations ?? reviewPacket?.knownLimitations ?? [];
  const pendingRequirements = requirements.filter((item) => (item.manual_status ?? item.status) !== "done").length;
  const evidenceAvailable = !!report || !!reviewPacket;
  const reviewReady = evidenceAvailable && view.grade !== "unverified" && pendingRequirements === 0 && (requirements.length > 0 || !!report);
  const summaryHtml = view.summary.trim() ? workResultSummaryHtml(view.summary) : "";
  const requirementRows = requirements.length
    ? requirements.map((item) => {
      const done = (item.manual_status ?? item.status) === "done";
      return `<tr><td><span class="state ${done ? "done" : "pending"}">${done ? "완료" : "확인 필요"}</span></td><td>${escapeHtml(requirementTitle(item.title))}</td></tr>`;
    }).join("")
    : `<tr><td colspan="2" class="muted">기록된 REQ가 없습니다.</td></tr>`;
  const test = report?.verification.test;
  const packetTests = reviewPacket?.tests ?? [];
  const testMetricLabel = view.testLabel ?? (packetTests.length ? `${packetTests.length}건 기록` : "기록 없음");
  const verificationRows = [
    ["테스트", view.testLabel ?? (packetTests.length ? `${packetTests.length}건의 실행 기록 (아래 상세)` : "기록 없음"), test?.state === "pass"],
    ["런타임 검증", view.runtimeVerified ? "확인됨" : "미확인", !!view.runtimeVerified],
    ["배선 검증", view.wiringVerified ? "확인됨" : "미확인", !!view.wiringVerified],
    ["검증 판정", report?.verification.validationVerdict ?? "기록 없음", report?.verification.validationVerdict === "pass"],
  ].map(([label, value, good]) => `<div class="evidence"><span>${label}</span><strong class="${good ? "good" : "caution"}">${escapeHtml(String(value))}</strong></div>`).join("");
  const command = view.testCommand ? `<div class="command"><span>$</span><code>${escapeHtml(view.testCommand)}</code></div>` : `<p class="muted">실행 명령 기록이 없습니다.</p>`;
  const timing = [workResult?.startedAt && `시작 ${workResult.startedAt}`, workResult?.endedAt && `종료 ${workResult.endedAt}`].filter(Boolean).join(" · ");
  const documentHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · ${escapeHtml(view.versionLabel)}</title><style>
    :root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#07101f;color:#dce7f5}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 82% 0,#12304a66,transparent 34%),#07101f}main{max-width:1080px;margin:0 auto;padding:48px 28px 88px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid #26364d;padding-bottom:24px}.eyebrow{font:700 12px ui-monospace,monospace;letter-spacing:.14em;color:#67e8f9}h1{margin:9px 0 8px;font-size:32px}.version,.muted{color:#8fa1b8}.version{font:13px ui-monospace,monospace}.print{border:1px solid #334762;background:#111f33;color:#dce7f5;border-radius:10px;padding:9px 13px;cursor:pointer}.decision,.panel{border:1px solid #26364d;border-radius:16px;background:#0c1728dd;padding:22px 24px;margin-top:18px}.decision{display:flex;gap:16px;align-items:center}.decision.ready{border-color:#1f806b;background:#0b302c}.decision.hold{border-color:#8b641c;background:#30240b}.decision strong{display:block;font-size:17px}.decision p{margin:5px 0 0;color:#b8c5d6}.mark{font-size:24px}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:18px}.metric{border:1px solid #26364d;border-radius:12px;background:#0c1728;padding:14px}.metric span{display:block;color:#8fa1b8;font-size:12px}.metric strong{display:block;margin-top:6px;font-size:15px}.grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}.panel h2{margin:0 0 15px;font-size:17px;color:#b8f4fc}.summary p{font-size:16px;line-height:1.8;margin:0 0 12px}.summary p:last-child{margin-bottom:0}.summary h2,.summary h3,.summary h4{margin:22px 0 10px;font-size:15px;color:#b8f4fc}.summary>h2:first-child,.summary>h3:first-child{margin-top:0}.summary table{margin:8px 0 16px}.summary th{padding:9px 8px;text-align:left;font-size:12px;color:#8fa1b8;border-bottom:1px solid #334762}.summary td{vertical-align:top}.summary code{font:12px ui-monospace,monospace;background:#050a13;border-radius:5px;padding:1px 5px;color:#b8f4fc}.summary ol,.summary ul{margin:0 0 12px}.summary strong{color:#f1f6fc}ul{margin:0;padding-left:20px}li{margin:9px 0;line-height:1.65;color:#c5d2e3;overflow-wrap:anywhere}.risk{border-color:#73551d}.risk h2{color:#facc6b}table{width:100%;border-collapse:collapse}td{padding:10px 8px;border-top:1px solid #23334a;font-size:14px}.state{display:inline-block;border-radius:999px;padding:3px 8px;font-size:11px;white-space:nowrap}.state.done{background:#0f513f;color:#9ff3d4}.state.pending{background:#5a4010;color:#ffd778}.evidence-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.evidence{border:1px solid #26364d;border-radius:10px;padding:12px}.evidence span{display:block;color:#8fa1b8;font-size:12px}.evidence strong{display:block;margin-top:5px;font-size:14px;line-height:1.65;white-space:pre-line;overflow-wrap:anywhere}.good{color:#6ee7b7}.caution{color:#fcd34d}.command{display:flex;gap:12px;border-radius:10px;background:#050a13;padding:14px;margin-top:13px;font:12px ui-monospace,monospace;color:#9fb0c6;overflow-wrap:anywhere}.command span{color:#6ee7b7}@media(max-width:760px){.grid,.metrics{grid-template-columns:1fr}header{display:block}.print{margin-top:14px}}@media print{body{background:#fff;color:#172033}.panel,.metric,.decision{background:#fff;border-color:#cbd5e1}.muted,.version{color:#64748b}.print{display:none}}</style></head><body><main><header><div><div class="eyebrow">SUGO REVIEW REPORT</div><h1>${escapeHtml(title)}</h1><div class="version">${escapeHtml(view.versionLabel)}${timing ? ` · ${escapeHtml(timing)}` : ""}</div></div><button class="print" onclick="window.print()">인쇄 / PDF 저장</button></header><section class="decision ${reviewReady ? "ready" : "hold"}"><div class="mark">${reviewReady ? "✓" : "!"}</div><div><strong>${reviewReady ? "review_done 판단 근거가 준비되었습니다" : "review_done 전에 확인할 항목이 남아 있습니다"}</strong><p>${reviewReady ? "모든 REQ와 기록된 검증 근거가 완료 상태입니다. 아래 근거와 남은 위험을 최종 확인하세요." : `${pendingRequirements}개 REQ 또는 검증 예외가 남아 있습니다. 승인 전 아래 노란 항목을 확인하세요.`}</p></div></section><div class="metrics"><div class="metric"><span>작업 차수</span><strong>${escapeHtml(view.versionLabel)}</strong></div><div class="metric"><span>REQ</span><strong>${requirements.length - pendingRequirements}/${requirements.length}</strong></div><div class="metric"><span>테스트</span><strong>${escapeHtml(view.testLabel ?? "기록 없음")}</strong></div><div class="metric"><span>변경 파일</span><strong>${files.length}개</strong></div><div class="metric"><span>사용자 확인</span><strong>${reviewPacket ? "확인 대기" : "결과 기록"}</strong></div></div><section class="panel summary"><h2>작업 결과 요약</h2>${summaryHtml || `<p class="muted">기록된 요약이 없습니다.</p>`}</section><div class="grid"><section class="panel"><h2>요구사항 충족 상태</h2><table>${requirementRows}</table></section><section class="panel"><h2>검증 증거</h2><div class="evidence-grid">${verificationRows}</div>${command}</section></div><section class="panel"><h2>변경 파일</h2>${reportList(files, "변경 파일 기록이 없습니다.")}</section><div class="grid"><section class="panel"><h2>설계 결정</h2>${reportList(decisions, "별도 설계 결정이 기록되지 않았습니다.")}</section><section class="panel risk"><h2>남은 사항 및 위험</h2>${reportList(risks, "기록된 제한 사항이 없습니다.")}</section></div></main></body></html>`;
  const populatedDocumentHtml = documentHtml.replace("</main>", `${packetTests.length ? `<section class="panel"><h2>검증 실행 기록</h2>${reportList(packetTests, "")}</section>` : ""}</main>`).replace(`${pendingRequirements}개 REQ 또는 검증 예외가 남아 있습니다.`, requirements.length ? `${pendingRequirements}개 요구사항이 미완료입니다. 검증 상태도 함께 확인하세요.` : "요구사항 커버리지 기록이 없습니다. 기록된 작업 범위와 검증 근거를 확인하세요.").replace(
    `<span>테스트</span><strong>${escapeHtml(view.testLabel ?? "기록 없음")}</strong>`,
    `<span>테스트</span><strong>${escapeHtml(testMetricLabel)}</strong>`,
  );
  const url = URL.createObjectURL(new Blob([populatedDocumentHtml], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function SummaryTab({ title, workResult, reviewPacket, requirements }: { title: string; workResult: ReturnType<typeof parseWorkResult>; reviewPacket?: ReviewPacket; requirements: RoadmapNode[] }) {
  if (!workResult && !reviewPacket) return <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-[var(--color-text-muted)]">review-agent가 판단 근거를 작성 중입니다. 검토 요청이 준비되면 이 탭에서 보고서를 열 수 있습니다.</div>;
  return (
    <button type="button" onClick={() => openWorkResultHtml(title, workResult, requirements, reviewPacket)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/35 bg-violet-400/10 px-4 py-4 text-sm font-semibold text-violet-100 hover:bg-violet-400/20">
      <ExternalLink size={16} /> 작업 요약 HTML로 열기
    </button>
  );
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

function FilesTab({ userId, workspace, taskId, sessionId, patchVersion, files, onOpenFile, aggregated = false }: { userId: string | null; workspace: string; taskId: string; sessionId?: string; patchVersion?: number; files: WorkResultFile[]; onOpenFile: (file: WorkResultFile, expanded?: boolean) => void; aggregated?: boolean }) {
  const [selected, setSelected] = useState<WorkResultFile | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function open(file: WorkResultFile, expanded: boolean) {
    setSelected(file);
    setError(null);
    if (file.diff || (file.content && file.change !== "modified" && !file.unavailableReason) || !userId) {
      onOpenFile(file, expanded);
      return;
    }
    setLoadingPath(file.path);
    try {
      const locator = reviewArtifactLocator(file, { taskId, sessionId, patchVersion });
      onOpenFile(await getReviewArtifact(userId, workspace, { ...locator, path: file.path }), expanded);
    } catch {
      setError("코드 아티팩트를 불러오지 못했습니다. 플러그인 동기화 상태를 확인하세요.");
    } finally {
      setLoadingPath(null);
    }
  }
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
              onClick={() => void open(f, false)}
              onDoubleClick={() => void open(f, true)}
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
                {loadingPath === f.path && <span className="mt-0.5 block text-[10px] text-cyan-300">코드 불러오는 중…</span>}
                {f.unavailableReason && <span className="mt-0.5 block text-[10px] text-amber-300/80">{f.unavailableReason}</span>}
              </span>
            </button>
          </li>
          );
        })}
      </ul>
      {error && <div className="rounded-lg border border-rose-400/25 bg-rose-400/5 px-3 py-2 text-xs text-rose-200">{error}</div>}
    </div>
  );
}

/**
 * REQ(subtask) 목록 — 설계안에서 REQ는 **그래프 노드가 아니라 이 패널**에 산다.
 *
 * `{taskId}::REQ-CONFIRM`(사용자 최종확인)은 §9상 **에이전트가 못 닫고 사람의 review_done으로만**
 * 완료되는 노드라, 다른 REQ와 구분해 표시한다 — 이게 섞이면 "AI가 다 끝냈다"로 잘못 읽힌다.
 */
function ReqList({ reqs, workspace, node, onChanged }: { reqs: RoadmapNode[]; workspace: string; node: RoadmapNode; onChanged: () => void }) {
  return (
    <div className="space-y-1">
      {reqs.map((r) => {
        const st = (r.manual_status ?? r.status ?? "pending").toLowerCase();
        const isConfirm = r.id.endsWith("::REQ-CONFIRM");
        const done = st === "done";
        return <div key={r.id} className="space-y-2">
          <div className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 ${isConfirm && !done ? "border-amber-500/30 bg-amber-500/5" : "border-[var(--color-border)] bg-[var(--color-background)]"}`}>
            <span className={`shrink-0 text-sm ${done ? "text-emerald-400" : "text-[var(--color-text-dim)]"}`}>
              {done ? "✓" : st === "in_progress" ? "◐" : "○"}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                done ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"
              }`}
              title={requirementTitle(r.title)}
            >
              {requirementTitle(r.title)}
            </span>
            {isConfirm && (
              <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${done ? "border-white/15 text-[var(--color-text-dim)]" : "border-amber-500/40 text-amber-300"}`}>
                {done ? "확인 완료" : "사용자 확인"}
              </span>
            )}
          </div>
          {isConfirm && <div className="rounded-lg border border-white/8 bg-black/10 px-3 py-2"><CompletionApprovalPanel workspace={workspace} node={node} onChanged={onChanged} /></div>}
        </div>;
      })}
    </div>
  );
}
