import { SpecDeploymentBadge } from "../components/SpecDeploymentBadge.js";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Archive, BookOpen, CalendarDays, CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, FilePenLine, LayoutList, Pencil, Shield, Trash2, Workflow } from "lucide-react";
import { cn } from "../lib/utils.js";
import { getWorkspaceColor, workspaceChipStyle } from "../lib/workspaceSelection.js";
import { buildMonthGrid, dayAccentClass, nowKST, toDateKey } from "../lib/calendar.js";
import { decodeScheduleDrag, encodeScheduleDrag, SCHEDULE_DRAG_TYPE } from "../lib/scheduleDrag.js";
import { daySpecOverflowClass, scheduleCardStyle, schedulePresentationReady } from "../lib/schedulePresentation.js";
import { krHolidayName } from "../lib/krHolidays.js";
import { Modal } from "../components/Modal.js";
import { CheckpointPanel } from "../components/CheckpointPanel.js";
import { AgentCanvasOverlay } from "../components/AgentCanvasOverlay.js";
import { DatePicker } from "../components/DatePicker.js";
import { SpecDocumentPanel } from "../components/SpecDocumentPanel.js";
import { ImagePasteZone, ImageThumb, SpecAttachments } from "../components/SpecAttachments.js";
import { BlockerDecisionPanel } from "../components/BlockerDecisionPanel.js";
import { openWorkResultHtml } from "../components/SubtaskPanel.js";
import { ScheduleMemoPanel, type ScheduleMemoDraft } from "../components/ScheduleMemoPanel.js";
import { useAuth } from "../auth/AuthContext.js";
import { useWorkspaces } from "../hooks/useWorkspaces.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { createQuickSpec, getSpecDraft, renameRoadmapNode, setDueDate, setProject, setWorkBranch, updateSpecDraft, uploadSpecAttachment, type ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { buildFeatCommand, buildPatchAttachCommand, buildPatchCommand, buildSpecWriterCommand, scheduleSpecStage, type SpecWriterProvider } from "../lib/scheduleSpecWorkflow.js";
import { scheduleAttention } from "../lib/taskGuidance.js";
import { createScheduleMemo, deleteScheduleMemo, restoreScheduleMemo, setScheduleMemoDueDate, updateScheduleMemo, type ScheduledMemo } from "../api/scheduleMemoApi.js";
import { SpecArchiveModal } from "../components/SpecArchiveModal.js";
import { buildCommitmentQueue, commitmentNextAction, legacyCommitments, type CommitmentView } from "../lib/scheduleCommitment.js";
import { updateScheduleCommitment } from "../api/scheduleCommitmentApi.js";
import { archiveScheduleSpec, restoreScheduleSpec, type ScheduleSpecArchiveReason } from "../api/scheduleSpecArchiveApi.js";
import { AI_WORK_STATUS_TOOL, WORKSPACE_RULES_TOOL } from "../lib/workspaceTools.js";
import { useNavigate, useSearchParams } from "react-router-dom";
import { findScheduleReviewTarget } from "../lib/scheduleReviewTarget.js";
import { PageHeading } from "../components/PageHeading.js";
import { latestDevelopmentPreview } from "../lib/scheduleDevelopmentPreview.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** CheckpointPanel의 동일 헬퍼와 같은 1줄 — 순환 import를 피하려고 그대로 복제. */
function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function latestWorkResultPath(spec: ScheduledSpec): string | null {
  const entries = [...(spec.development_history ?? [])].sort((a, b) => b.version - a.version);
  const fromHistory = entries.find((entry) => entry.work_result_path)?.work_result_path;
  if (fromHistory) return fromHistory;
  const focus = spec.focus_task_work_result;
  return focus && typeof focus === "object" && typeof (focus as Record<string, unknown>).path === "string"
    ? (focus as Record<string, string>).path
    : null;
}

function SpecStageBadge({ spec, compact = false }: { spec: ScheduledSpec; compact?: boolean }) {
  const guidance = scheduleAttention(spec);
  const tone = ({
    draft: "bg-slate-500/15 text-slate-400",
    ready: "bg-sky-500/15 text-sky-300",
    in_progress: "bg-cyan-500/15 text-cyan-300",
    blocked: "bg-orange-500/20 text-orange-300",
    verification: "bg-amber-500/20 text-amber-300",
    attention: "bg-amber-500/20 text-amber-300",
    done: "bg-emerald-500/15 text-emerald-300",
    pending: "bg-slate-500/15 text-slate-400",
  } as const)[guidance.kind];
  const label = guidance.kind === "done" ? "파이프라인 완료" : guidance.label;
  return <span className={cn("shrink-0 rounded px-1 py-0.5 font-semibold", compact ? "text-[8px]" : "text-[9px]", tone)}>{label}</span>;
}

function DeploymentReach({ spec }: { spec: ScheduledSpec | null }) {
  const reached = spec?.deployment?.environment ?? "UNKNOWN";
  const order = ["LOCAL", "DEV", "STG", "PRD"] as const;
  const reachedIndex = order.indexOf(reached as (typeof order)[number]);
  return <div className="flex shrink-0 items-center gap-1" aria-label={`최신 작업 배포 범위 ${reached}`} title="이 SPEC의 최신 feat 또는 patch가 확인된 마지막 환경">
    {order.map((environment, index) => <span key={environment} className={cn("rounded-md border px-1.5 py-1 font-mono text-[9px] font-bold", index <= reachedIndex ? "border-sky-400/35 bg-sky-400/12 text-sky-200" : "border-white/[0.08] bg-black/10 text-slate-600")}>{environment}</span>)}
  </div>;
}

export function SchedulePage() {
  const { userId } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: workspaces, error: workspaceError } = useWorkspaces();
  const { data: specs, memos, commitments, archives, memoArchives, refetch } = useSchedule();
  const reviewWorkspace = searchParams.get("reviewWorkspace");
  const reviewSpec = searchParams.get("reviewSpec");
  const returnTo = searchParams.get("returnTo");
  const reviewTargetOpened = useRef(false);

  const today = nowKST();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [scheduleView, setScheduleView] = useState<"agenda" | "month">("agenda");
  const [selected, setSelected] = useState<ScheduledSpec | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [memoTarget, setMemoTarget] = useState<{ memo?: ScheduledMemo; initialDate?: string | null } | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addWorkspace, setAddWorkspace] = useState("");
  const [addProjectPath, setAddProjectPath] = useState("");
  const [addDate, setAddDate] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState("");
  // 생성 전에는 SPEC id가 없으므로 붙여 넣은 화면을 들고 있다가 생성 직후 올린다.
  const [addImages, setAddImages] = useState<Array<{ file: File; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("create") === "1") setAddOpen(true);
  }, [searchParams]);

  function openSpec(spec: ScheduledSpec) {
    setArchiveConfirm(null);
    setBranchDraft(null);
    setProjectMenuOpen(false);
    setSelected(spec);
  }

  function openMemo(memo: ScheduledMemo) {
    setMemoTarget({ memo });
  }

  useEffect(() => {
    if (!reviewWorkspace || reviewTargetOpened.current || !specs?.length) return;
    const reviewTarget = findScheduleReviewTarget(specs, reviewWorkspace, reviewSpec, (spec) => {
      const kind = scheduleAttention(spec).kind;
      return kind === "blocked" || kind === "attention" || kind === "verification";
    });
    if (!reviewTarget) return;
    reviewTargetOpened.current = true;
    openSpec(reviewTarget);
  }, [reviewSpec, reviewWorkspace, specs]);
  // 마감일/프로젝트 select는 클릭 즉시 저장되고 별도 "저장" 버튼이 없다 — 저장됐는지 눈에
  // 안 보이면 사용자가 헷갈린다. 성공 시 잠깐 "저장됨"을 보여준다.
  const [savedFlash, setSavedFlash] = useState<"due" | "project" | "branch" | "title" | null>(null);
  // Canvas의 이름 변경(✎)과 같은 API(renameRoadmapNode → manual_title)라 여기서 바꿔도
  // Canvas에 그대로 반영된다 — null이면 편집 중이 아님.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [branchDraft, setBranchDraft] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [writerProvider, setWriterProvider] = useState<SpecWriterProvider>("claude");
  const [archiveConfirm, setArchiveConfirm] = useState<ScheduleSpecArchiveReason | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [detailDraft, setDetailDraft] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeProjectMenu = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setProjectMenuOpen(false);
        return;
      }
      if (!projectMenuRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    document.addEventListener("mousedown", closeProjectMenu);
    window.addEventListener("keydown", closeProjectMenu);
    return () => {
      document.removeEventListener("mousedown", closeProjectMenu);
      window.removeEventListener("keydown", closeProjectMenu);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!archiveConfirm) return;
    const cancelArchive = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setArchiveConfirm(null);
    };
    window.addEventListener("keydown", cancelArchive, true);
    return () => window.removeEventListener("keydown", cancelArchive, true);
  }, [archiveConfirm, busy]);

  // 체크포인트/캔버스는 다른 화면으로 리다이렉트하지 않고
  // Schedule 위에 겹쳐서 뜬다 — Esc를 누르면 그냥 이 오버레이만 닫히고 Schedule로 남는다.
  const [checkpointTarget, setCheckpointTarget] = useState<{ workspace: string; projectPath: string | null; dueDate: string | null } | null>(null);
  const [canvasOverlay, setCanvasOverlay] = useState<{ workspace: string; nodeId: string; filePath?: string } | null>(null);
  const [specDocumentTarget, setSpecDocumentTarget] = useState<{ workspace: string; nodeId: string; title: string } | null>(null);

  // spec-writer는 다른 터미널에서 완료되므로 4초 폴링 결과를 열린 상세에도 반영한다.
  useEffect(() => {
    if (!selected || !specs) return;
    const fresh = specs.find((spec) => spec.id === selected.id && spec.workspace_name === selected.workspace_name);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [specs, selected]);

  useEffect(() => {
    if (!selected || selected.spec_path) return setDetailDraft("");
    let cancelled = false;
    if (!userId) return;
    getSpecDraft(userId, selected.workspace_name, selected.id)
      .then((value) => { if (!cancelled) setDetailDraft(value.content ?? ""); })
      .catch(() => { if (!cancelled) setDetailDraft(""); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.workspace_name, selected?.spec_path, userId]);

  const todayKey = toDateKey(today);
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  /** 홈 화면 도메인 카드와 완전히 같은 색(목록 순서 기반) — 화면마다 색이 따로 계산되면 안 된다. */
  const colorOf = useMemo(() => {
    const order = new Map((workspaces ?? []).map((w, i) => [w.name, i]));
    return (name: string) => getWorkspaceColor(name, order.get(name) ?? 0);
  }, [workspaces]);

  const memosByDate = useMemo(() => {
    const map = new Map<string, ScheduledMemo[]>();
    for (const memo of memos ?? []) {
      if (!memo.due_date) continue;
      map.set(memo.due_date, [...(map.get(memo.due_date) ?? []), memo]);
    }
    return map;
  }, [memos]);

  const sortedMemos = useMemo(
    () => [...(memos ?? [])].sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }),
    [memos],
  );

  const [panelMode, setPanelMode] = useState<"backlog" | "memo">("backlog");
  const commitmentViews = useMemo<CommitmentView[]>(() => {
    if (!specs) return [];
    if (commitments === null) return legacyCommitments(specs);
    const specByKey = new Map(specs.map((spec) => [`${spec.workspace_name}:${spec.id}`, spec]));
    const explicit = commitments.flatMap((commitment) => {
      const spec = specByKey.get(`${commitment.workspace_name}:${commitment.spec_id}`);
      if (!spec) return [];
      return [{
        ...commitment,
        // SPEC 종료는 archive가 정본이다. 과거의 commitment 완료 상태만으로 Agenda에서 숨기지 않는다.
        state: "active" as const,
        pipeline_status: spec?.status,
        current_environment: spec?.deployment?.environment,
      }];
    });
    const committedSpecs = new Set(commitments.map((item) => `${item.workspace_name}:${item.spec_id}`));
    const legacy = legacyCommitments(specs.filter((spec) => !committedSpecs.has(`${spec.workspace_name}:${spec.id}`)));
    return [...explicit, ...legacy];
  }, [commitments, specs]);
  const agenda = useMemo(() => buildCommitmentQueue(commitmentViews, todayKey), [commitmentViews, todayKey]);
  const planningInbox = useMemo(() => commitmentViews.filter((item) => item.state !== "completed" && item.state !== "cancelled" && !item.due_date), [commitmentViews]);
  const byDate = useMemo(() => {
    const map = new Map<string, CommitmentView[]>();
    for (const item of commitmentViews) {
      if (!item.due_date) continue;
      map.set(item.due_date, [...(map.get(item.due_date) ?? []), item]);
    }
    return map;
  }, [commitmentViews]);
  function specForCommitment(commitment: CommitmentView): ScheduledSpec | null {
    return specs?.find((spec) => spec.workspace_name === commitment.workspace_name && spec.id === commitment.spec_id) ?? null;
  }
  function jumpToDate(dueDate: string) {
    const [year, month] = dueDate.split("-").map(Number);
    setCursor({ year, month: month - 1 });
  }

  /** 오늘(KST) 기준 남은 일수 — 음수면 이미 지난 마감. */
  function daysUntil(dueDate: string): number {
    const [year, month, day] = dueDate.split("-").map(Number);
    const due = new Date(year, month - 1, day);
    return Math.round((due.getTime() - today.getTime()) / 86_400_000);
  }

  function flashSaved(field: "due" | "project" | "branch" | "title") {
    setSavedFlash(field);
    setTimeout(() => setSavedFlash((current) => (current === field ? null : current)), 1600);
  }

  async function copyWorkflowCommand(kind: string, command: string) {
    await navigator.clipboard.writeText(command);
    setCopied(kind);
    setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1800);
  }

  async function applyDueDate(spec: ScheduledSpec, dueDate: string | null) {
    if (!userId) return;
    setErrorMsg(null);
    try {
      await setDueDate(userId, spec.workspace_name, spec.id, dueDate);
      refetch();
      if (selected?.id === spec.id) setSelected({ ...spec, due_date: dueDate });
      flashSaved("due");
    } catch {
      setErrorMsg("날짜 저장에 실패했습니다. Run/Task가 아닌 Spec인지 확인하세요.");
    }
  }

  async function applyProject(spec: ScheduledSpec, projectPath: string | null) {
    if (!userId) return;
    setErrorMsg(null);
    try {
      await setProject(userId, spec.workspace_name, spec.id, projectPath);
      refetch();
      if (selected?.id === spec.id) setSelected({ ...spec, project_path: projectPath });
      flashSaved("project");
    } catch {
      setErrorMsg("프로젝트 지정에 실패했습니다. Run/Task가 아닌 Spec인지 확인하세요.");
    }
  }

  async function applyWorkBranch(spec: ScheduledSpec, value: string) {
    const workBranch = value.trim() || null;
    setBranchDraft(null);
    if (!userId || workBranch === spec.work_branch) return;
    setErrorMsg(null);
    try {
      await setWorkBranch(userId, spec.workspace_name, spec.id, workBranch);
      refetch();
      if (selected?.id === spec.id) setSelected({ ...spec, work_branch: workBranch });
      flashSaved("branch");
    } catch {
      setErrorMsg("작업 브랜치 저장에 실패했습니다.");
    }
  }

  async function applyTitle(spec: ScheduledSpec, title: string) {
    if (!userId || !title.trim() || title === spec.title) {
      setTitleDraft(null);
      return;
    }
    setErrorMsg(null);
    try {
      await renameRoadmapNode(userId, spec.workspace_name, spec.id, title.trim());
      refetch();
      if (selected?.id === spec.id) setSelected({ ...spec, title: title.trim() });
      flashSaved("title");
    } catch {
      setErrorMsg("이름 변경에 실패했습니다.");
    } finally {
      setTitleDraft(null);
    }
  }

  function startSpecDrag(e: DragEvent<HTMLElement>, spec: ScheduledSpec) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(SCHEDULE_DRAG_TYPE, encodeScheduleDrag({ kind: "spec", workspaceName: spec.workspace_name, id: spec.id }));
  }

  function startMemoDrag(e: DragEvent<HTMLElement>, memo: ScheduledMemo) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(SCHEDULE_DRAG_TYPE, encodeScheduleDrag({ kind: "memo", id: memo.id }));
  }

  function startCommitmentDrag(e: DragEvent<HTMLElement>, commitment: CommitmentView) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(SCHEDULE_DRAG_TYPE, encodeScheduleDrag({ kind: "commitment", id: commitment.id }));
  }

  function dropScheduleItem(e: DragEvent<HTMLElement>, dueDate: string | null) {
    e.preventDefault();
    setDragOverKey(null);
    const payload = decodeScheduleDrag(e.dataTransfer.getData(SCHEDULE_DRAG_TYPE));
    if (!payload) return;
    if (payload.kind === "memo") {
      const memo = (memos ?? []).find((item) => item.id === payload.id);
      if (!memo || memo.due_date === dueDate || !userId) return;
      setErrorMsg(null);
      void setScheduleMemoDueDate(userId, memo.id, dueDate).then(refetch).catch(() => setErrorMsg("메모 날짜 저장에 실패했습니다."));
      return;
    }
    if (payload.kind === "commitment") {
      const commitment = (commitments ?? []).find((item) => item.id === payload.id);
      if (!commitment || commitment.due_date === dueDate || !userId) return;
      setErrorMsg(null);
      void updateScheduleCommitment(userId, { ...commitment, due_date: dueDate }).then(refetch).catch(() => setErrorMsg("마감일 저장에 실패했습니다."));
      return;
    }
    const spec = (specs ?? []).find((item) => item.id === payload.id && item.workspace_name === payload.workspaceName);
    if (!spec || spec.due_date === dueDate) return;
    void applyDueDate(spec, dueDate);
  }

  async function saveMemo(draft: ScheduleMemoDraft) {
    if (!userId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (memoTarget?.memo) await updateScheduleMemo(userId, memoTarget.memo.id, draft);
      else await createScheduleMemo(userId, draft);
      setMemoTarget(null);
      refetch();
    } catch { setErrorMsg("메모 저장에 실패했습니다."); }
    finally { setBusy(false); }
  }

  async function removeMemo() {
    if (!userId || !memoTarget?.memo) return;
    setBusy(true);
    try { await deleteScheduleMemo(userId, memoTarget.memo.id); setMemoTarget(null); refetch(); }
    catch { setErrorMsg("메모를 보관하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function handleAddQuickSpec() {
    if (!userId || !addTitle.trim() || !addWorkspace) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const created = await createQuickSpec(userId, addWorkspace, addTitle.trim(), addDate, addProjectPath || null);
      if (addDraft.trim()) await updateSpecDraft(userId, addWorkspace, created.id, addDraft);
      try {
        for (const image of addImages) await uploadSpecAttachment(userId, addWorkspace, created.id, image.file);
      } catch {
        setErrorMsg("SPEC은 추가됐지만 일부 기획 화면을 올리지 못했습니다. SPEC 상세에서 다시 붙여 넣으세요.");
      }
      addImages.forEach((image) => URL.revokeObjectURL(image.url));
      setAddImages([]);
      setAddOpen(false);
      setAddTitle("");
      setAddWorkspace("");
      setAddProjectPath("");
      setAddDate(null);
      setAddDraft("");
      refetch();
    } catch {
      setErrorMsg("일정 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveSpec(spec: ScheduledSpec, reason: ScheduleSpecArchiveReason) {
    if (!userId || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await archiveScheduleSpec(userId, spec.workspace_name, spec.id, reason);
      setSelected(null);
      setArchiveConfirm(null);
      refetch();
    } catch {
      setErrorMsg(reason === "closed" ? "SPEC을 종료하지 못했습니다." : "SPEC을 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /** 선택된 워크스페이스에 등록된 프로젝트 목록 — SPEC 일정 추가의 2단계 선택에 쓴다. */
  const addWorkspaceProjects = useMemo(
    () => (workspaces ?? []).find((w) => w.name === addWorkspace)?.projects ?? [],
    [workspaces, addWorkspace],
  );

  /** 스펙 상세의 "대상 프로젝트" 드롭다운 — 그 스펙이 속한 워크스페이스의 등록 프로젝트만 보여준다. */
  const selectedWorkspaceProjects = useMemo(
    () => (workspaces ?? []).find((w) => w.name === selected?.workspace_name)?.projects ?? [],
    [workspaces, selected?.workspace_name],
  );

  if (!schedulePresentationReady(specs, workspaces)) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageHeading eyebrow="DELIVERY SCHEDULE" title="일정 관리" description={scheduleView === "month" ? "각 작업 일정을 드래그해 캘린더에 배치하고 목표일을 한눈에 관리합니다." : "개발 항목의 목표일과 확인이 필요한 작업을 한곳에서 관리합니다."} />
        <div className="ck-glass ck-card flex min-h-0 flex-1 items-center justify-center text-[12px] text-[var(--color-text-dim)]">
          {workspaceError ? "워크스페이스 색상 정보를 불러오지 못했습니다." : "불러오는 중…"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeading eyebrow="DELIVERY SCHEDULE" title="일정 관리" description={scheduleView === "month" ? "각 작업 일정을 드래그해 캘린더에 배치하고 목표일을 한눈에 관리합니다." : "개발 항목의 목표일과 확인이 필요한 작업을 한곳에서 관리합니다."} action={
        <div className="flex h-9 items-center gap-2">
          <button type="button" onClick={() => setTrashOpen(true)} className="relative flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-slate-400 hover:bg-white/[0.05] hover:text-white" title="삭제하거나 종료한 작업 보기">
            <Archive size={15} /> 보관함
            {archives.length + memoArchives.length > 0 && <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 font-mono text-[9px] text-slate-300">{archives.length + memoArchives.length}</span>}
          </button>
          <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1" aria-label="일정 보기 방식">
            <button
              type="button"
              aria-pressed={scheduleView === "agenda"}
              onClick={() => setScheduleView("agenda")}
              className={cn("flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-all", scheduleView === "agenda" ? "bg-cyan-500/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]" : "text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-white")}
            >
              <LayoutList size={14} /> Agenda
            </button>
            <button
              type="button"
              aria-pressed={scheduleView === "month"}
              onClick={() => setScheduleView("month")}
              className={cn("flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-all", scheduleView === "month" ? "bg-cyan-500/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]" : "text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-white")}
            >
              <CalendarDays size={14} /> Calendar
            </button>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[12.5px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            <CalendarPlus size={15} /> 개발 일정 추가
          </button>
        </div>
      } />

      {errorMsg && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">{errorMsg}</div>
      )}

      <div className={cn("grid min-h-0 flex-1 grid-cols-1 gap-3 2xl:gap-4", scheduleView === "month" && "grid-cols-[clamp(150px,14vw,220px)_minmax(0,1fr)]")}>
        {scheduleView === "month" && (
        <div
          className="ck-glass ck-card flex min-w-0 flex-col gap-2 overflow-auto p-3 transition-colors"
          onDragOver={(event) => {
            if (panelMode !== "backlog") return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOverKey("backlog");
          }}
          onDragLeave={() => setDragOverKey((key) => (key === "backlog" ? null : key))}
          onDrop={(e) => panelMode === "backlog" && dropScheduleItem(e, null)}
        >
          <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--color-border)] p-0.5 text-[11px] font-semibold">
            <button
              onClick={() => setPanelMode("backlog")}
              role="tab"
              aria-selected={panelMode === "backlog"}
              className={cn("flex-1 rounded-md px-2 py-1 transition-colors", panelMode === "backlog" ? "bg-cyan-500/15 text-cyan-300" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]")}
            >
              Planning Inbox
            </button>
            <button
              onClick={() => setPanelMode("memo")}
              role="tab"
              aria-selected={panelMode === "memo"}
              className={cn("flex-1 rounded-md px-2 py-1 transition-colors", panelMode === "memo" ? "bg-cyan-500/15 text-cyan-300" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]")}
            >
              메모
            </button>
          </div>

          {panelMode === "backlog" ? (
            <>
              {planningInbox.length === 0 && <p className="text-[11.5px] text-[var(--color-text-dim)]">날짜를 정할 작업이 없습니다.</p>}
              {planningInbox.map((commitment) => {
                const style = scheduleCardStyle(colorOf(commitment.workspace_name));
                const action = commitmentNextAction(commitment);
                const spec = specForCommitment(commitment);
                return (
                  <button
                    key={commitment.id}
                    type="button"
                    onClick={() => spec && openSpec(spec)}
                    style={style}
                    className="flex min-h-[76px] flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left text-slate-100 transition-[box-shadow,background-color] hover:shadow-[inset_0_0_0_1px_rgba(241,245,249,0.24)]"
                  >
                    <span className="w-full break-keep text-[12.5px] font-semibold leading-5">{commitment.title}</span>
                    <span className="text-[10px] text-cyan-200">{action.label}</span>
                    <span className="line-clamp-2 text-[9.5px] text-[var(--color-text-dim)]">{action.detail}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {sortedMemos.length === 0 && <p className="text-[11.5px] text-[var(--color-text-dim)]">등록된 메모가 없습니다.</p>}
              {sortedMemos.map((memo) => (
                <button
                  key={memo.id}
                  draggable
                  onDragStart={(event) => startMemoDrag(event, memo)}
                  onDragEnd={() => setDragOverKey(null)}
                  onClick={() => openMemo(memo)}
                  className="flex min-h-9 cursor-grab flex-col gap-1 rounded-lg border border-slate-400/45 bg-slate-400/[0.14] px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-100 hover:bg-slate-400/20 active:cursor-grabbing"
                >
                  <span className="flex min-w-0 items-center gap-1.5"><FilePenLine size={11} className="shrink-0 text-slate-300" /><span className="truncate">{memo.title}</span></span>
                  <span className="font-mono text-[9.5px] text-slate-400">{memo.due_date ?? "기한 미정"}</span>
                </button>
              ))}
            </>
          )}
        </div>
        )}

        {scheduleView === "agenda" ? (
          <section className="ck-glass command-stage ck-stage-in flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)]" aria-label="실행 대기열">
            <div className="ck-scroll min-h-0 flex-1 overflow-auto p-4">
              {agenda.length === 0 && sortedMemos.length === 0 ? (
                <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                  <Check size={28} className="mb-3 text-emerald-300" />
                  <h3 className="text-base font-semibold text-white">해야 할 일이 없습니다</h3>
                  <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">열려 있는 마감 일정이 없습니다. 완료·과거 일정은 Calendar에서 확인할 수 있습니다.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {agenda.map((group) => (
                    <section key={group.id} aria-labelledby={`agenda-${group.id}`}>
                      <div className="mb-2.5 flex items-center gap-2.5">
                        <span className={cn("h-2.5 w-2.5 rounded-full", group.id === "overdue" ? "bg-rose-400" : group.id === "today" ? "bg-cyan-300" : group.id === "next" ? "bg-blue-400" : "bg-slate-500")} />
                        <h3 id={`agenda-${group.id}`} className="text-[14px] font-bold text-white">{group.label}</h3>
                        <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">{group.items.length}</span>
                        <span className="text-[11.5px] text-[var(--color-text-dim)]">{group.description}</span>
                      </div>
                      <div className="grid gap-2 xl:grid-cols-2">
                        {group.items.map((commitment) => {
                          const remaining = commitment.due_date ? daysUntil(commitment.due_date) : null;
                          const style = scheduleCardStyle(colorOf(commitment.workspace_name));
                          const spec = specForCommitment(commitment);
                          return (
                            <div
                              key={commitment.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => spec && openSpec(spec)}
                              onKeyDown={(event) => {
                                if ((event.key === "Enter" || event.key === " ") && spec) openSpec(spec);
                              }}
                              style={style}
                              className="group flex h-[92px] items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.035] hover:shadow-[0_12px_28px_rgba(0,0,0,0.2)] active:translate-y-0"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-semibold text-white">{commitment.title}</span>
                                  {commitment.pipeline_status === "done" && <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">파이프라인 완료</span>}
                                  {commitment.pipeline_status === "running" && <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">진행 중</span>}
                                </div>
                                <div className="mt-2 flex items-center text-[11px] text-[var(--color-text-muted)]">
                                  {commitment.due_date && <span className="flex items-center gap-1.5 font-mono text-slate-300"><CalendarDays size={11} className="text-slate-500" />{commitment.due_date}</span>}
                                  {remaining === null
                                    ? <span>기한 미정</span>
                                    : remaining < 0
                                      ? <span className="ml-2 border-l border-white/10 pl-2 font-mono font-semibold text-rose-300">D+{Math.abs(remaining)}</span>
                                      : remaining === 0
                                        ? <span className="ml-2 border-l border-white/10 pl-2 font-mono font-semibold text-cyan-200">D-Day</span>
                                        : <span className="ml-2 border-l border-white/10 pl-2 font-mono font-semibold text-sky-300">D-{remaining}</span>}
                                </div>
                              </div>
                              <DeploymentReach spec={spec} />
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  {sortedMemos.length > 0 && (
                    <section aria-labelledby="agenda-memos">
                      <div className="mb-2.5 flex items-center gap-2.5">
                        <FilePenLine size={14} className="text-slate-300" />
                        <h3 id="agenda-memos" className="text-[14px] font-bold text-white">메모</h3>
                        <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">{sortedMemos.length}</span>
                      </div>
                      <div className="grid gap-2 xl:grid-cols-2">
                        {sortedMemos.map((memo) => <button key={memo.id} type="button" onClick={() => openMemo(memo)} className="flex min-h-[62px] items-center gap-3 rounded-xl border border-slate-400/25 bg-slate-400/[0.07] px-4 py-3 text-left transition-colors hover:bg-slate-400/[0.12]"><FilePenLine size={14} className="shrink-0 text-slate-300" /><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] text-slate-100">{memo.title}</strong><span className="mt-1 block font-mono text-[10px] text-slate-500">{memo.due_date ?? "기한 없음"}</span></span></button>)}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
        /* 월간 캘린더 (KST 기준, 주말/공휴일 표시) */
        <div className="ck-glass ck-card ck-stage-in flex min-h-0 flex-col overflow-hidden p-3">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
                className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-cyan-300"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="w-28 text-center font-mono text-[14px] font-bold text-[var(--color-text-bright)]">
                {cursor.year}.{String(cursor.month + 1).padStart(2, "0")}
              </span>
              <button
                onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
                className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-cyan-300"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11.5px] text-[var(--color-text-muted)] hover:text-cyan-300"
            >
              오늘
            </button>
          </div>

          <div className="grid shrink-0 grid-cols-7 text-center font-mono text-[11px]">
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={w} className={cn("py-1 text-[var(--color-text-dim)]", i === 0 && "text-rose-400", i === 6 && "text-blue-400")}>
                {w}
              </div>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1 overflow-auto p-px">
            {grid.map((day, dayIndex) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === cursor.month;
              const dayChips = byDate.get(key) ?? [];
              const dayMemos = memosByDate.get(key) ?? [];
              const isToday = key === todayKey;
              const holiday = krHolidayName(key);
              return (
                <div
                  key={key}
                  onDoubleClick={() => setMemoTarget({ initialDate: key })}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => dropScheduleItem(e, key)}
                  className={cn(
                    "group relative flex select-none flex-col gap-1 overflow-visible rounded-lg border p-1.5 text-left",
                    inMonth ? "border-[var(--color-border)] bg-[var(--color-background)]" : "border-transparent opacity-40",
                    isToday && "ring-1 ring-cyan-400/60",
                    dragOverKey === key && "border-cyan-400 bg-cyan-500/10",
                  )}
                >
                  <div className="flex h-4 shrink-0 items-baseline justify-between gap-1">
                    <span className={cn("font-mono text-[11px]", isToday ? "font-bold text-cyan-300" : dayAccentClass(day))}>
                      {day.getDate()}
                    </span>
                    {holiday && <span className="truncate text-[9px] text-rose-400" title={holiday}>{holiday}</span>}
                  </div>
                  {dayChips.length === 0 && dayMemos.length === 0 && inMonth && (
                    <span className="pointer-events-none absolute inset-x-2 bottom-2 translate-y-1 text-center text-[9.5px] font-medium text-slate-500 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      더블클릭해 메모
                    </span>
                  )}
                  <div className={cn("flex min-h-0 flex-1 flex-col gap-1 max-[1900px]:flex-row max-[1900px]:flex-wrap max-[1900px]:content-start max-[1900px]:!overflow-visible", daySpecOverflowClass())}>
                    {dayChips.map((commitment) => {
                      const style = scheduleCardStyle(colorOf(commitment.workspace_name));
                      const spec = specForCommitment(commitment);
                      const preview = spec ? latestDevelopmentPreview(spec) : null;
                      const explicit = !commitment.id.startsWith("legacy:");
                      return (
                        <div
                          key={commitment.id}
                          draggable={explicit || !!spec}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onDragStart={(e: DragEvent<HTMLDivElement>) => explicit ? startCommitmentDrag(e, commitment) : spec && startSpecDrag(e, spec)}
                          onDragEnd={() => setDragOverKey(null)}
                          className="shrink-0"
                        >
                          <button
                            type="button"
                            onClick={() => spec && openSpec(spec)}
                            aria-label={`개발 일정 · ${commitment.title}`}
                            className="group/marker relative hidden h-2.5 w-2.5 rounded-[3px] border border-white/35 shadow-[0_0_7px_rgba(255,255,255,0.16)] max-[1900px]:block"
                            style={{ backgroundColor: colorOf(commitment.workspace_name) }}
                          >
                            <span className={cn("pointer-events-none absolute z-50 w-72 translate-y-1 rounded-xl border border-slate-600/80 bg-[#080f1b] p-3 text-left opacity-0 shadow-2xl transition-all group-hover/marker:translate-y-0 group-hover/marker:opacity-100 group-focus-visible/marker:translate-y-0 group-focus-visible/marker:opacity-100", dayIndex >= 21 ? "bottom-full mb-2" : "top-full mt-2", day.getDay() >= 5 ? "right-0" : "left-0")}>
                              <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-cyan-300/75">일정 미리보기</span>
                              <strong className="mt-1.5 block text-[12px] leading-5 text-white">{commitment.title}</strong>
                              <span className="mt-1 block text-[9px] text-slate-500">{commitment.workspace_name} · {commitment.due_date ?? "날짜 미정"}</span>
                              {preview ? <span className="mt-2 block border-t border-white/10 pt-2"><span className="block font-mono text-[9px] font-bold text-violet-200">최근 작업 · {preview.label}</span><span className="mt-1 block line-clamp-1 text-[10px] font-normal leading-4 text-slate-300">{preview.title}</span></span> : <span className="mt-2 block border-t border-white/10 pt-2 text-[10px] text-slate-500">아직 완료된 개발 이력이 없습니다.</span>}
                            </span>
                          </button>
                          <div style={style} className="flex min-h-[26px] cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 text-left text-[11px] transition-[box-shadow,background-color] hover:shadow-[inset_0_0_0_1px_rgba(241,245,249,0.28)] max-[1900px]:hidden">
                            <button type="button" onClick={() => spec && openSpec(spec)} className="min-w-0 flex-1 truncate text-left font-semibold text-slate-100">{commitment.title}</button>
                            {commitment.pipeline_status === "done" && <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-semibold text-emerald-300">파이프라인 완료</span>}
                            {spec && <SpecDeploymentBadge deployment={spec.deployment} title={commitment.title} />}
                          </div>
                        </div>
                      );
                    })}
                    {dayMemos.map((memo) => <div key={memo.id} draggable onDoubleClick={(event) => event.stopPropagation()} onDragStart={(event: DragEvent<HTMLDivElement>) => startMemoDrag(event, memo)} onDragEnd={() => setDragOverKey(null)} className="group/memo relative flex min-h-[26px] shrink-0 cursor-grab items-center gap-1.5 rounded-md border border-slate-400/45 bg-slate-400/[0.14] px-2 py-0.5 text-left text-[11px] text-slate-100 hover:bg-slate-400/20 active:cursor-grabbing max-[1900px]:min-h-0 max-[1900px]:h-2.5 max-[1900px]:w-2.5 max-[1900px]:rounded-[3px] max-[1900px]:border-slate-200/55 max-[1900px]:bg-slate-200/75 max-[1900px]:p-0"><FilePenLine size={10} className="shrink-0 text-slate-300 max-[1900px]:hidden" /><button type="button" onClick={() => openMemo(memo)} aria-label={`메모 · ${memo.title}`} className="min-w-0 flex-1 truncate text-left max-[1900px]:absolute max-[1900px]:inset-0 max-[1900px]:text-transparent">{memo.title}</button><span className={cn("pointer-events-none absolute z-50 hidden max-w-60 translate-y-1 truncate whitespace-nowrap rounded-lg border border-slate-600/80 bg-[#080f1b] px-2.5 py-1.5 text-left text-[12px] font-medium text-white opacity-0 shadow-xl transition-all group-hover/memo:translate-y-0 group-hover/memo:opacity-100 group-focus-within/memo:translate-y-0 group-focus-within/memo:opacity-100 max-[1900px]:block", dayIndex >= 21 ? "bottom-full mb-2" : "top-full mt-2", day.getDay() >= 5 ? "right-0" : "left-0")}>{memo.title}</span></div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {memoTarget && <ScheduleMemoPanel memo={memoTarget.memo} initialDate={memoTarget.initialDate} busy={busy} onSave={saveMemo} onDelete={memoTarget.memo ? removeMemo : undefined} onClose={() => setMemoTarget(null)} />}

      {/* Spec 상세 패널 */}
      {selected && (
        <Modal
          size="xwide"
          onClose={() => {
            setSelected(null);
            setTitleDraft(null);
            if (returnTo === "home") navigate("/home");
          }}
          disableEscape={!!checkpointTarget || !!canvasOverlay || !!specDocumentTarget || !!archiveConfirm}
        >
          <div className="space-y-4">
            <div>
              <span
                className="inline-block rounded-full border px-2 py-0.5 text-[11px]"
                style={workspaceChipStyle(colorOf(selected.workspace_name))}
              >
                {selected.workspace_name}
              </span>
              {titleDraft !== null && !selected.has_run ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => void applyTitle(selected, titleDraft)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void applyTitle(selected, titleDraft);
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setTitleDraft(null);
                    }
                  }}
                  className="mt-2 block w-full rounded-lg border border-cyan-400/40 bg-[var(--color-background)] px-2.5 py-1 text-lg font-bold text-[var(--color-text-bright)] outline-none"
                />
              ) : (
                <div className="mt-2 flex items-center gap-1.5">
                  <h2 className="text-lg font-bold text-[var(--color-text-bright)]">{selected.title}</h2>
                  <button
                    disabled={selected.has_run}
                    onClick={() => setTitleDraft(selected.title)}
                    title="이름 변경 — Canvas에도 그대로 반영됩니다"
                    className="shrink-0 rounded p-1 text-[var(--color-text-dim)] hover:bg-cyan-500/10 hover:text-cyan-300 disabled:hidden"
                  >
                    <Pencil size={13} />
                  </button>
                  {savedFlash === "title" && <span className="text-[10.5px] font-semibold text-emerald-400">저장됨</span>}
                </div>
              )}
              <p className="font-mono text-[11px] text-[var(--color-text-dim)]">{selected.id} · {selected.status}</p>
              {(() => {
                const guidance = scheduleAttention(selected);
                return (
                  <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.07] px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="font-semibold text-white">{guidance.kind === "done" ? "파이프라인 완료" : guidance.currentStage}</strong>
                      {guidance.kind !== "done" && <SpecStageBadge spec={selected} />}
                      <SpecDeploymentBadge deployment={selected.deployment} title={selected.title} />
                    </div>
                    {guidance.kind !== "done" && selected.focus_task_human_blocker?.kind !== "review_confirmation" && <>
                    <p className="mt-1 text-slate-300">{guidance.reason}</p>
                    <p className="mt-2"><span className="text-cyan-300">권장 작업</span> · {guidance.nextAction}</p>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">{guidance.blockedNextStep}</p>
                    </>}
                  </div>
                );
              })()}
              {selected.focus_task_id && selected.focus_task_status === "blocked" && (
                <div className="mt-3">
                  <BlockerDecisionPanel
                    onOpenReport={() => openWorkResultHtml(selected.title, null, [], selected.focus_task_human_blocker?.reviewPacket)}
                    onOpenDiff={selected.focus_task_human_blocker?.reviewPacket?.files?.[0] ? () => setCanvasOverlay({ workspace: selected.workspace_name, nodeId: selected.focus_task_id!, filePath: selected.focus_task_human_blocker!.reviewPacket!.files![0].path }) : undefined}
                    userId={userId}
                    workspace={selected.workspace_name}
                    taskId={selected.focus_task_id}
                    taskTitle={selected.focus_task_title ?? selected.focus_task_id}
                    question={selected.focus_task_note ?? null}
                    decision={selected.focus_task_blocker_decision}
                    blocker={selected.focus_task_human_blocker}
                    onSaved={refetch}
                  />
                </div>
              )}
              <section className="mt-3 rounded-xl border border-white/[0.09] bg-white/[0.025] p-4" aria-label="개발 이력">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-white">개발 이력</h3>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">{selected.development_history?.length ?? 0}회</span>
                </div>
                {(selected.development_history?.length ?? 0) > 0 ? (
                  <ol className="mt-3.5 space-y-0">
                    {selected.development_history?.map((entry, index) => (
                      <li key={`${entry.task_id}:${entry.version}`} className="relative flex gap-3.5 pb-3.5 last:pb-0">
                        {index < (selected.development_history?.length ?? 0) - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-white/10" />}
                        <span className={cn("relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2", entry.version === 0 ? "border-cyan-300 bg-cyan-950" : "border-violet-300 bg-violet-950")} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase", entry.version === 0 ? "bg-cyan-400/10 text-cyan-200" : "bg-violet-400/10 text-violet-200")}>{entry.version === 0 ? "feat" : `patch ${entry.version}`}</span>
                            <span className="text-[13.5px] font-semibold leading-relaxed text-slate-100">{entry.title}</span>
                          </div>
                          {entry.completed_at && <time className="mt-1 block font-mono text-[9.5px] text-slate-500">{entry.completed_at.slice(0, 10)}</time>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="mt-3 text-[10.5px] text-slate-500">아직 실행된 feat 또는 patch가 없습니다.</p>}
              </section>

              {selected.spec_path && (
                <button
                  onClick={() => setSpecDocumentTarget({ workspace: selected.workspace_name, nodeId: selected.id, title: selected.title })}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-300 transition-colors hover:text-cyan-200"
                >
                  <BookOpen size={13} /> {selected.has_run ? "개발 명세" : "개발 명세 편집"} <ChevronRight size={12} />
                </button>
              )}
            </div>

            {!selected.spec_path && (
              <section className="rounded-xl border border-white/[0.1] bg-white/[0.025] p-4" aria-label="SPEC 초안">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">SPEC 초안</h3>
                  <button disabled={busy || !detailDraft.trim() || !userId} onClick={async () => { if (!userId) return; setBusy(true); setDraftSaved(false); try { await updateSpecDraft(userId, selected.workspace_name, selected.id, detailDraft); setDraftSaved(true); } finally { setBusy(false); } }} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 disabled:opacity-40">{draftSaved ? "저장됨" : "저장"}</button>
                </div>
                <textarea value={detailDraft} onChange={(event) => { setDetailDraft(event.target.value); setDraftSaved(false); }} rows={8} placeholder="문제, 목적, 범위, 완료 조건을 자유롭게 적으세요." className="block w-full resize-y rounded-xl border border-white/[0.1] bg-black/20 px-3 py-2.5 text-[13px] leading-6 text-slate-100 outline-none focus:border-cyan-400/50" />
              </section>
            )}

            <SpecAttachments workspace={selected.workspace_name} nodeId={selected.id} hasSpec={!!selected.spec_path} />

            <section className="rounded-xl border border-white/[0.1] bg-white/[0.035] p-4" aria-label="작업 컨텍스트">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">작업 컨텍스트</h3>
                </div>
                {savedFlash && savedFlash !== "title" && <span className="text-[10px] font-semibold text-emerald-400">변경사항 저장됨</span>}
              </div>
              <div className="grid rounded-xl border border-white/[0.08] bg-black/20 xl:grid-cols-[0.72fr_1fr_1.3fr] xl:divide-x xl:divide-white/[0.07]">
                <div className="border-b border-white/[0.07] px-4 py-2.5 xl:border-b-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">완료 목표일</span>
                  <DatePicker className="h-8 border-0 bg-transparent px-0 py-0 font-mono shadow-none" value={selected.due_date} onChange={(next) => void applyDueDate(selected, next)} />
                </div>
                <div ref={projectMenuRef} className="relative block border-b border-white/[0.07] px-4 py-2.5 xl:border-b-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">저장소</span>
                  <button
                    type="button"
                    disabled={selected.has_run}
                    aria-haspopup="listbox"
                    aria-expanded={projectMenuOpen}
                    onClick={() => setProjectMenuOpen((open) => !open)}
                    className="flex h-8 w-full items-center justify-between gap-3 rounded-md text-left text-[13px] font-semibold text-slate-100 outline-none transition-colors hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className={cn("truncate", !selected.project_path && "text-slate-500")}>{selected.project_path ? repoName(selected.project_path) : "미지정"}</span>
                    <ChevronDown size={14} className={cn("shrink-0 text-slate-500 transition-transform", projectMenuOpen && "rotate-180")} />
                  </button>
                  {projectMenuOpen && !selected.has_run && (
                    <div role="listbox" aria-label="저장소 선택" className="absolute left-3 right-3 top-[calc(100%-4px)] z-30 overflow-hidden rounded-xl border border-white/[0.12] bg-slate-900 p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.5)]">
                      {[{ project_path: "", label: "미지정" }, ...selectedWorkspaceProjects.map((project) => ({ project_path: project.project_path, label: repoName(project.project_path) }))].map((project) => {
                        const active = (selected.project_path ?? "") === project.project_path;
                        return <button key={project.project_path || "unset"} type="button" role="option" aria-selected={active} onClick={() => { setProjectMenuOpen(false); void applyProject(selected, project.project_path || null); }} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors", active ? "bg-cyan-400/10 text-cyan-100" : "text-slate-300 hover:bg-white/[0.06] hover:text-white")}><span className="truncate">{project.label}</span>{active && <Check size={13} className="shrink-0 text-cyan-300" />}</button>;
                      })}
                    </div>
                  )}
                </div>
                <label className="block px-4 py-2.5">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">작업 브랜치</span>
                  <input
                    disabled={selected.has_run || !selected.project_path}
                    value={branchDraft ?? selected.work_branch ?? ""}
                    onChange={(event) => setBranchDraft(event.target.value)}
                    onBlur={(event) => void applyWorkBranch(selected, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setBranchDraft(null);
                    }}
                    placeholder="현재 브랜치 사용"
                    className="block h-8 w-full border-0 bg-transparent p-0 text-[13px] font-mono text-slate-100 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>
            </section>

            {(!selected.has_run || selected.status === "done") && <section className="rounded-xl border border-white/[0.1] bg-slate-950/35 p-5" aria-label={selected.status === "done" ? "후속 개발" : "작업 준비"}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{selected.status === "done" ? "후속 개발" : "작업 준비"}</h3>
                  <p className="mt-1 text-[11.5px] text-slate-300">{selected.status === "done" ? "마지막 완료 결과를 기준으로 다음 patch를 시작합니다." : scheduleSpecStage(selected) === "ready" ? "작성된 SPEC으로 feat를 시작하거나, 필요하면 SPEC을 다시 작성합니다." : "실행 에이전트를 선택하고 SPEC 작성 명령을 생성합니다."}</p>
                </div>
              {scheduleSpecStage(selected) !== "in_progress" && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div>
                    <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.08em] text-slate-500">실행 에이전트</span>
                    <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5">
                      {(["claude", "codex"] as SpecWriterProvider[]).map((provider) => <button key={provider} type="button" aria-pressed={writerProvider === provider} onClick={() => setWriterProvider(provider)} className={cn("rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors", writerProvider === provider ? "bg-violet-400/15 text-violet-200" : "text-slate-500 hover:text-slate-300")}>{provider === "claude" ? "Claude" : "Codex"}</button>)}
                    </div>
                  </div>
                  <button
                    disabled={!selected.project_path}
                    onClick={() => void copyWorkflowCommand(`writer-${writerProvider}`, buildSpecWriterCommand(selected, writerProvider))}
                    className={cn("mt-auto inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", scheduleSpecStage(selected) === "ready" ? "text-violet-200 hover:bg-violet-400/10" : "bg-violet-400 px-4 font-bold text-slate-950 hover:bg-violet-300")}
                  >
                    {copied === `writer-${writerProvider}` ? <Check size={13} /> : <Copy size={13} />}
                    {copied === `writer-${writerProvider}` ? "복사됨" : scheduleSpecStage(selected) === "ready" ? "SPEC 재작성" : "SPEC 작성 명령 복사"}
                  </button>
                  {scheduleSpecStage(selected) === "ready" && (
                    <button
                      disabled={!selected.project_path || !selected.spec_path}
                      onClick={() => void copyWorkflowCommand("feat", buildFeatCommand(selected))}
                      className="mt-auto inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-violet-400 px-4 text-[11.5px] font-bold text-slate-950 transition-colors hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copied === "feat" ? <Check size={13} /> : <Copy size={13} />}
                      {copied === "feat" ? "복사됨" : "feat 시작"}
                    </button>
                  )}
                </div>
              )}
              {selected.status === "done" && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={!latestWorkResultPath(selected)}
                    onClick={() => { const path = latestWorkResultPath(selected); if (path) void copyWorkflowCommand("patch", buildPatchCommand(path)); }}
                    className="inline-flex min-h-10 w-[156px] items-center justify-center gap-2 rounded-lg bg-violet-400 px-4 text-[12px] font-bold text-slate-950 transition-colors hover:bg-violet-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {copied === "patch" ? <Check size={14} /> : <Copy size={14} />} {copied === "patch" ? "복사됨" : latestWorkResultPath(selected) ? "새 Patch 시작" : "Patch 준비 중"}
                  </button>
                  <span className="group/attach-help relative inline-flex">
                    <button
                      disabled={!latestWorkResultPath(selected)}
                      onClick={() => { const path = latestWorkResultPath(selected); if (path) void copyWorkflowCommand("patch-attach", buildPatchAttachCommand(path)); }}
                      aria-describedby="patch-attach-help"
                      className="inline-flex min-h-10 w-[174px] items-center justify-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-400/[0.08] px-4 text-[12px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                    >
                      {copied === "patch-attach" ? <Check size={14} /> : <Copy size={14} />} {copied === "patch-attach" ? "복사됨" : "작업 기록 이어붙이기"}
                    </button>
                    <span id="patch-attach-help" role="tooltip" className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-slate-600/70 bg-[#080f1b] px-3 py-2 text-[10px] leading-4 text-slate-300 opacity-0 shadow-xl transition-opacity group-hover/attach-help:opacity-100 group-focus-within/attach-help:opacity-100">이미 끝낸 변경을 최신 개발 이력에 연결합니다.</span>
                  </span>
                </div>
              )}
              </div>
              {!selected.project_path && <p className="mt-3 text-[10.5px] text-amber-300">Repository를 선택하면 명령을 생성할 수 있습니다.</p>}
              {selected.spec_path && <p className="mt-3 truncate border-t border-white/[0.06] pt-3 font-mono text-[9.5px] text-slate-600" title={selected.spec_path}>{selected.spec_path}</p>}
            </section>}

            <nav className="grid gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-2" aria-label="프로젝트 도구">
              <button
                disabled={!selected.project_path}
                onClick={() => {
                  if (!selected.project_path) return;
                  setCheckpointTarget({ workspace: selected.workspace_name, projectPath: selected.project_path, dueDate: selected.due_date });
                }}
                title={selected.project_path ? undefined : "먼저 위에서 대상 프로젝트를 지정해야 체크포인트를 관리할 수 있습니다"}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3.5 text-left transition-colors hover:border-amber-400/30 hover:bg-amber-400/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <span className="rounded-lg bg-amber-400/10 p-2 text-amber-300"><Shield size={16} /></span>
                <span className="min-w-0 flex-1"><strong className="block text-[13px] text-slate-100">{WORKSPACE_RULES_TOOL.label}</strong><span className="mt-0.5 block text-[11px] text-slate-400">{WORKSPACE_RULES_TOOL.projectDescription}</span></span>
                <ChevronRight size={15} className="text-slate-500 group-hover:text-amber-300" />
              </button>
              <button
                onClick={() => setCanvasOverlay({ workspace: selected.workspace_name, nodeId: selected.focus_task_id ?? selected.id })}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
              >
                <span className="rounded-lg bg-cyan-400/10 p-2 text-cyan-300"><Workflow size={16} /></span>
                <span className="min-w-0 flex-1"><strong className="block text-[13px] text-slate-100">{AI_WORK_STATUS_TOOL.label}</strong><span className="mt-0.5 block text-[11px] text-slate-400">{AI_WORK_STATUS_TOOL.description}</span></span>
                <ChevronRight size={15} className="text-slate-500 group-hover:text-cyan-300" />
              </button>
            </nav>

            <div className="border-t border-white/[0.08] pt-4">
              <div className="flex items-center justify-between gap-4">
                <button onClick={() => setArchiveConfirm("deleted")} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13} /> 작업 삭제</button>
                <button onClick={() => setArchiveConfirm("closed")} className="flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11.5px] font-semibold text-amber-200 hover:bg-amber-400/10"><Archive size={13} /> 작업 종료</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {selected && archiveConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]" onClick={() => !busy && setArchiveConfirm(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="spec-archive-confirm-title" className={cn("w-full max-w-md rounded-2xl border bg-[#0c131f] p-6 shadow-2xl", archiveConfirm === "deleted" ? "border-rose-500/35" : "border-amber-400/30")} onClick={(event) => event.stopPropagation()}>
            <span className={cn("inline-flex rounded-lg p-2", archiveConfirm === "deleted" ? "bg-rose-400/10 text-rose-300" : "bg-amber-400/10 text-amber-200")}>{archiveConfirm === "deleted" ? <Trash2 size={18} /> : <Archive size={18} />}</span>
            <h2 id="spec-archive-confirm-title" className="mt-4 text-lg font-bold text-white">{archiveConfirm === "deleted" ? "이 작업을 삭제할까요?" : "이 개발 항목을 종료할까요?"}</h2>
            <p className="mt-2 text-[12px] leading-6 text-slate-400">{archiveConfirm === "deleted" ? "잘못 만들었거나 더 이상 사용하지 않는 작업을 활성 화면에서 제거합니다." : "개발이 끝난 항목으로 기록하고 열려 있는 일정을 모두 완료 처리합니다."} 개발 이력과 파일은 지우지 않으며 보관함에서 확인하고 복구할 수 있습니다.</p>
            <div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={() => setArchiveConfirm(null)} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-slate-300 hover:bg-white/[0.06]">취소</button><button disabled={busy} onClick={() => void handleArchiveSpec(selected, archiveConfirm)} className={cn("rounded-lg border px-4 py-2 text-[12px] font-bold disabled:opacity-50", archiveConfirm === "deleted" ? "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" : "border-amber-400/35 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20")}>{busy ? "처리 중…" : archiveConfirm === "deleted" ? "보관함으로 이동" : "종료 처리"}</button></div>
          </div>
        </div>
      )}

      {trashOpen && <SpecArchiveModal items={archives} memos={memoArchives} busy={busy} onClose={() => setTrashOpen(false)} onRestore={async item => { if (!userId) return; setBusy(true); try { await restoreScheduleSpec(userId, item.workspace_name, item.spec_id); refetch(); } catch { setErrorMsg("개발 항목을 복구하지 못했습니다."); } finally { setBusy(false); } }} onRestoreMemo={async memo => { if (!userId) return; setBusy(true); try { await restoreScheduleMemo(userId, memo.id); refetch(); } catch { setErrorMsg("메모를 복구하지 못했습니다."); } finally { setBusy(false); } }} />}

      {/* 경량 Spec 추가("+ SPEC 일정 추가") */}
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--color-text-bright)]">개발 일정 추가</h2>
            <p className="text-[12px] text-[var(--color-text-muted)]">
              최상위 SPEC 초안의 제목과 마감일만 먼저 잡아둡니다. Run/Task와 <code>/sugo:feat</code> 파이프라인은 아직 연결되지 않습니다.
            </p>
            <label className="block text-[12px] text-[var(--color-text-muted)]">
              제목
              <input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="예: 다음 분기 마이그레이션"
                className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[13px] text-[var(--color-text)]"
              />
            </label>
            <label className="block text-[12px] text-[var(--color-text-muted)]">
              워크스페이스
              <select
                value={addWorkspace}
                onChange={(e) => {
                  setAddWorkspace(e.target.value);
                  setAddProjectPath("");
                }}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[13px] text-[var(--color-text)]"
              >
                <option value="">선택</option>
                {(workspaces ?? []).map((w) => (
                  <option key={w.name} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] text-[var(--color-text-muted)]">
              프로젝트(선택)
              <select
                value={addProjectPath}
                onChange={(e) => setAddProjectPath(e.target.value)}
                disabled={!addWorkspace}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[13px] text-[var(--color-text)] disabled:opacity-40"
              >
                <option value="">프로젝트 미지정</option>
                {addWorkspaceProjects.map((p) => (
                  <option key={p.project_path} value={p.project_path}>
                    {repoName(p.project_path)}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1 block text-[12px] text-[var(--color-text-muted)]">마감일(선택)</span>
              <DatePicker value={addDate} onChange={setAddDate} placeholder="선택 안 함" />
            </div>
            <label className="block text-[12px] text-[var(--color-text-muted)]">
              SPEC 초안
              <textarea value={addDraft} onChange={(event) => setAddDraft(event.target.value)} rows={9} placeholder="문제, 목적, 범위, 완료 조건을 자유롭게 적으세요. 정식 SPEC 작성 시 이 내용을 구조화합니다." className="mt-1.5 block w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-[13px] leading-6 text-[var(--color-text)] outline-none focus:border-cyan-400/50" />
            </label>
            <div className="space-y-2">
              <span className="block text-[12px] text-[var(--color-text-muted)]">기획 화면(선택)</span>
              {addImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {addImages.map((image, index) => (
                    <ImageThumb
                      key={image.url}
                      src={image.url}
                      label={`${index + 1}`}
                      onRemove={() => {
                        URL.revokeObjectURL(image.url);
                        setAddImages((prev) => prev.filter((item) => item.url !== image.url));
                      }}
                    />
                  ))}
                </div>
              )}
              <ImagePasteZone onImages={(files) => setAddImages((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))])} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setAddOpen(false)} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12px]">
                취소
              </button>
              <button
                disabled={busy || !addTitle.trim() || !addWorkspace}
                onClick={() => void handleAddQuickSpec()}
                className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-[12px] font-bold text-cyan-200 disabled:opacity-40"
              >
                SPEC 초안 추가
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 체크포인트/캔버스는 다른 화면으로 안 보내고 Schedule 위에 겹쳐서 연다.
          Esc를 누르면 이 오버레이만 닫히고 Schedule로 그대로 남는다. */}
      {checkpointTarget && (
        <CheckpointPanel
          workspace={checkpointTarget.workspace}
          projectPath={checkpointTarget.projectPath}
          defaultExpiresAt={checkpointTarget.dueDate}
          onClose={() => setCheckpointTarget(null)}
        />
      )}
      {canvasOverlay && (
        <AgentCanvasOverlay
          workspace={canvasOverlay.workspace}
          focusNodeId={canvasOverlay.nodeId}
          initialFilePath={canvasOverlay.filePath}
          onClose={() => setCanvasOverlay(null)}
        />
      )}
      {specDocumentTarget && (
        <SpecDocumentPanel
          workspace={specDocumentTarget.workspace}
          nodeId={specDocumentTarget.nodeId}
          title={specDocumentTarget.title}
          onClose={() => setSpecDocumentTarget(null)}
        />
      )}
    </div>
  );
}
