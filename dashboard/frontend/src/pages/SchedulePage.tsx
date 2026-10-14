import { SpecDeploymentBadge } from "../components/SpecDeploymentBadge.js";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { AlertTriangle, BookOpen, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, CircleDashed, Clock, Copy, FilePenLine, LayoutList, Pencil, Shield, Trash2, Workflow } from "lucide-react";
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
import { ScheduleMemoPanel, type ScheduleMemoDraft } from "../components/ScheduleMemoPanel.js";
import { useAuth } from "../auth/AuthContext.js";
import { useWorkspaces } from "../hooks/useWorkspaces.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { createQuickSpec, deleteQuickSpec, renameRoadmapNode, setDueDate, setProject, setWorkBranch, uploadSpecAttachment, type ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { buildFeatCommand, buildSpecWriterCommand, scheduleSpecStage, type SpecWriterProvider } from "../lib/scheduleSpecWorkflow.js";
import { scheduleAttention } from "../lib/taskGuidance.js";
import { createScheduleMemo, deleteScheduleMemo, setScheduleMemoDueDate, updateScheduleMemo, type ScheduledMemo } from "../api/scheduleMemoApi.js";
import { OperationalPulse } from "../components/OperationalPulse.js";
import { buildCommitmentQueue, commitmentNextAction, legacyCommitments, type CommitmentView } from "../lib/scheduleCommitment.js";
import { completeScheduleCommitment, createScheduleCommitment, reopenScheduleCommitment, updateScheduleCommitment, type CommitmentTarget } from "../api/scheduleCommitmentApi.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** CheckpointPanel의 동일 헬퍼와 같은 1줄 — 순환 import를 피하려고 그대로 복제. */
function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

/** 표류(dropped)를 제외한 "미완료"만 마감 임박/초과 강조 대상으로 본다. */
function isOpenStatus(spec: ScheduledSpec): boolean {
  return spec.status !== "done" && spec.status !== "dropped";
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

export function SchedulePage() {
  const { userId } = useAuth();
  const { data: workspaces, error: workspaceError } = useWorkspaces();
  const { data: specs, memos, commitments, refetch } = useSchedule();

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
  // 생성 전에는 SPEC id가 없으므로 붙여 넣은 화면을 들고 있다가 생성 직후 올린다.
  const [addImages, setAddImages] = useState<Array<{ file: File; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commitmentFormOpen, setCommitmentFormOpen] = useState(false);
  const [commitmentTitle, setCommitmentTitle] = useState("");
  const [commitmentTarget, setCommitmentTarget] = useState<CommitmentTarget>("implementation");
  const [commitmentDueDate, setCommitmentDueDate] = useState<string | null>(null);

  function openSpec(spec: ScheduledSpec) {
    setDeleteConfirm(false);
    setBranchDraft(null);
    setSelected(spec);
    setCommitmentFormOpen(false);
  }
  // 마감일/프로젝트 select는 클릭 즉시 저장되고 별도 "저장" 버튼이 없다 — 저장됐는지 눈에
  // 안 보이면 사용자가 헷갈린다(2026-09-23 사용자 피드백). 성공 시 잠깐 "저장됨"을 보여준다.
  const [savedFlash, setSavedFlash] = useState<"due" | "project" | "branch" | "title" | null>(null);
  // Canvas의 이름 변경(✎)과 같은 API(renameRoadmapNode → manual_title)라 여기서 바꿔도
  // Canvas에 그대로 반영된다(2026-09-23 사용자 요청) — null이면 편집 중이 아님.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [branchDraft, setBranchDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // §7B 사용자 결정(2026-09-23): 체크포인트/캔버스는 다른 화면으로 리다이렉트하지 않고
  // Schedule 위에 겹쳐서 뜬다 — Esc를 누르면 그냥 이 오버레이만 닫히고 Schedule로 남는다.
  const [checkpointTarget, setCheckpointTarget] = useState<{ workspace: string; projectPath: string | null; dueDate: string | null } | null>(null);
  const [canvasOverlay, setCanvasOverlay] = useState<{ workspace: string; nodeId: string } | null>(null);
  const [specDocumentTarget, setSpecDocumentTarget] = useState<{ workspace: string; nodeId: string; title: string } | null>(null);

  // spec-writer는 다른 터미널에서 완료되므로 4초 폴링 결과를 열린 상세에도 반영한다.
  useEffect(() => {
    if (!selected || !specs) return;
    const fresh = specs.find((spec) => spec.id === selected.id && spec.workspace_name === selected.workspace_name);
    if (fresh && (fresh.spec_path !== selected.spec_path || fresh.has_run !== selected.has_run)) setSelected(fresh);
  }, [specs, selected]);

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
    const explicit = commitments.map((commitment) => {
      const spec = specByKey.get(`${commitment.workspace_name}:${commitment.spec_id}`);
      return {
        ...commitment,
        pipeline_status: spec?.status,
        current_environment: spec?.deployment?.environment,
      };
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
  const openCommitmentCount = useMemo(() => commitmentViews.filter((item) => item.state !== "completed" && item.state !== "cancelled").length, [commitmentViews]);
  const commitmentPulse = useMemo(() => {
    const open = commitmentViews.filter((item) => item.state === "planned" || item.state === "active");
    const weekEnd = new Date(`${todayKey}T00:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);
    return {
      dueToday: open.filter((item) => item.due_date === todayKey).length,
      dueThisWeek: open.filter((item) => item.due_date && item.due_date >= todayKey && item.due_date <= weekEndKey).length,
      overdue: open.filter((item) => item.due_date && item.due_date < todayKey).length,
      unscheduled: open.filter((item) => !item.due_date).length,
    };
  }, [commitmentViews, todayKey]);

  function specForCommitment(commitment: CommitmentView): ScheduledSpec | null {
    return specs?.find((spec) => spec.workspace_name === commitment.workspace_name && spec.id === commitment.spec_id) ?? null;
  }
  const selectedCommitments = useMemo(
    () => selected ? commitmentViews.filter((item) => item.workspace_name === selected.workspace_name && item.spec_id === selected.id && !item.id.startsWith("legacy:")) : [],
    [commitmentViews, selected],
  );

  async function addCommitment() {
    if (!userId || !selected || !commitmentTitle.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await createScheduleCommitment(userId, {
        specId: selected.id,
        workspaceName: selected.workspace_name,
        title: commitmentTitle.trim(),
        dueDate: commitmentDueDate,
        target: commitmentTarget,
      });
      setCommitmentFormOpen(false);
      setCommitmentTitle("");
      refetch();
    } catch {
      setErrorMsg("작업 목표를 추가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function setCommitmentClosed(commitment: CommitmentView, closed: boolean) {
    if (!userId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (closed) await completeScheduleCommitment(userId, commitment.id);
      else await reopenScheduleCommitment(userId, commitment.id);
      refetch();
    } catch {
      setErrorMsg(closed ? "작업 목표를 완료하지 못했습니다." : "작업 목표를 다시 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function completeFromQueue(commitment: CommitmentView) {
    if (!userId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (commitment.id.startsWith("legacy:")) {
        await createScheduleCommitment(userId, {
          specId: commitment.spec_id,
          workspaceName: commitment.workspace_name,
          title: commitment.title,
          dueDate: commitment.due_date,
          state: "completed",
          target: commitment.target,
          linkedRunId: commitment.linked_run_id,
        });
      } else {
        await completeScheduleCommitment(userId, commitment.id);
      }
      refetch();
    } catch {
      setErrorMsg("완료 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
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
    catch { setErrorMsg("메모 삭제에 실패했습니다."); }
    finally { setBusy(false); }
  }

  async function handleAddQuickSpec() {
    if (!userId || !addTitle.trim() || !addWorkspace) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const created = await createQuickSpec(userId, addWorkspace, addTitle.trim(), addDate, addProjectPath || null);
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
      refetch();
    } catch {
      setErrorMsg("일정 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteQuickSpec(spec: ScheduledSpec) {
    if (!userId || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await deleteQuickSpec(userId, spec.workspace_name, spec.id);
      setSelected(null);
      setDeleteConfirm(false);
      refetch();
    } catch {
      setErrorMsg("대시보드에서 만든 수동 SPEC만 삭제할 수 있습니다.");
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
        <h1 className="text-lg font-semibold text-[var(--color-text-bright)]">Schedule</h1>
        <div className="ck-glass ck-card flex min-h-0 flex-1 items-center justify-center text-[12px] text-[var(--color-text-dim)]">
          {workspaceError ? "워크스페이스 색상 정보를 불러오지 못했습니다." : "불러오는 중…"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-[var(--color-text-bright)]">
            Schedule{" "}
            <span className="font-normal text-[var(--color-text-dim)]" title="현재 열려 있는 작업 목표 수">
              ({openCommitmentCount})
            </span>
          </h1>
          <OperationalPulse
            label="일정 운영 현황"
            items={[
              { label: "오늘", value: commitmentPulse.dueToday, icon: Clock, tone: commitmentPulse.dueToday > 0 ? "cyan" : "neutral" },
              { label: "7일 내", value: commitmentPulse.dueThisWeek, icon: CalendarDays, tone: commitmentPulse.dueThisWeek > 0 ? "cyan" : "neutral" },
              { label: "기한 초과", value: commitmentPulse.overdue, icon: AlertTriangle, tone: commitmentPulse.overdue > 0 ? "danger" : "neutral" },
              { label: "기한 미정", value: commitmentPulse.unscheduled, icon: CircleDashed, tone: commitmentPulse.unscheduled > 0 ? "warning" : "neutral" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
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
              <CalendarDays size={14} /> Month
            </button>
          </div>
          <button onClick={() => setMemoTarget({})} className="flex items-center gap-1.5 rounded-lg border border-slate-500/40 bg-slate-500/10 px-3 py-1.5 text-[12.5px] font-semibold text-slate-200 transition-colors hover:bg-slate-500/20"><FilePenLine size={15} /> 메모 추가</button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[12.5px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            <CalendarPlus size={15} /> SPEC 일정 추가
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">{errorMsg}</div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <div
          className="ck-glass ck-card flex flex-col gap-2 overflow-auto p-3 transition-colors"
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
                    className="flex min-h-12 flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left text-slate-100 transition-[box-shadow,background-color] hover:shadow-[inset_0_0_0_1px_rgba(241,245,249,0.24)]"
                    title={`${commitment.workspace_name} · ${commitment.title}`}
                  >
                    <span className="w-full truncate text-[12.5px] font-semibold">{commitment.title}</span>
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
                  onClick={() => {
                    setMemoTarget({ memo });
                    if (memo.due_date) jumpToDate(memo.due_date);
                  }}
                  className="flex min-h-9 cursor-grab flex-col gap-1 rounded-lg border border-slate-400/45 bg-slate-400/[0.14] px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-100 hover:bg-slate-400/20 active:cursor-grabbing"
                >
                  <span className="flex min-w-0 items-center gap-1.5"><FilePenLine size={11} className="shrink-0 text-slate-300" /><span className="truncate">{memo.title}</span></span>
                  <span className="font-mono text-[9.5px] text-slate-400">{memo.due_date ?? "기한 미정"}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {scheduleView === "agenda" ? (
          <section className="ck-glass command-stage ck-stage-in flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)]" aria-label="실행 대기열">
            <div className="flex shrink-0 items-end justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-300/80">WORK QUEUE</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--color-text-bright)]">해야 할 일</h2>
                <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">개발 진행 상태와 일정 완료를 구분해 보여줍니다.</p>
              </div>
              <button type="button" onClick={() => setScheduleView("month")} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-white">월간 배치 보기 →</button>
            </div>
            <div className="ck-scroll min-h-0 flex-1 overflow-auto p-4">
              {agenda.length === 0 ? (
                <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                  <Check size={28} className="mb-3 text-emerald-300" />
                  <h3 className="text-base font-semibold text-white">해야 할 일이 없습니다</h3>
                  <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">새 작업이 생기면 SPEC 상세에서 작업 목표를 추가하세요.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {agenda.map((group) => (
                    <section key={group.id} aria-labelledby={`agenda-${group.id}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", group.id === "overdue" ? "bg-rose-400" : group.id === "today" ? "bg-cyan-300" : group.id === "next" ? "bg-blue-400" : "bg-slate-500")} />
                        <h3 id={`agenda-${group.id}`} className="text-[13px] font-bold text-white">{group.label}</h3>
                        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{group.items.length}</span>
                        <span className="text-[11px] text-[var(--color-text-dim)]">{group.description}</span>
                      </div>
                      <div className="grid gap-2 xl:grid-cols-2">
                        {group.items.map((commitment) => {
                          const remaining = commitment.due_date ? daysUntil(commitment.due_date) : null;
                          const style = scheduleCardStyle(colorOf(commitment.workspace_name));
                          const action = commitmentNextAction(commitment);
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
                              className="group flex min-h-[76px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.035] hover:shadow-[0_12px_28px_rgba(0,0,0,0.2)] active:translate-y-0"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-semibold text-white">{commitment.title}</span>
                                  {commitment.pipeline_status === "done" && <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">파이프라인 완료</span>}
                                </div>
                                {action.label !== "완료 처리" && <p className="mt-1 text-[12px] font-semibold text-cyan-200">{action.label}</p>}
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                  <span>{action.detail}</span>
                                  {commitment.due_date && <span className="font-mono text-slate-300">{commitment.due_date}</span>}
                                  {group.id === "overdue" && remaining !== null && <span className="font-semibold text-rose-300">{Math.abs(remaining)}일 지남</span>}
                                  {group.id === "next" && remaining !== null && <span>D-{remaining}</span>}
                                </div>
                              </div>
                              {action.label === "완료 처리" ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void completeFromQueue(commitment);
                                  }}
                                  className="shrink-0 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-40"
                                >
                                  완료 처리
                                </button>
                              ) : <ChevronRight size={16} className="shrink-0 text-[var(--color-text-dim)] transition-transform group-hover:translate-x-1 group-hover:text-cyan-300" />}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
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
            {grid.map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === cursor.month;
              const dayChips = byDate.get(key) ?? [];
              const dayMemos = memosByDate.get(key) ?? [];
              const isToday = key === todayKey;
              const holiday = krHolidayName(key);
              return (
                <div
                  key={key}
                  onDoubleClick={() => dayChips.length === 0 && dayMemos.length === 0 && setMemoTarget({ initialDate: key })}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => dropScheduleItem(e, key)}
                  className={cn(
                    "flex flex-col gap-1 overflow-hidden rounded-lg border p-1.5 text-left",
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
                  <div className={cn("flex min-h-0 flex-1 flex-col gap-1", daySpecOverflowClass())}>
                    {dayChips.map((commitment) => {
                      const style = scheduleCardStyle(colorOf(commitment.workspace_name));
                      const overdue = key < todayKey && commitment.state !== "completed" && commitment.state !== "cancelled";
                      const spec = specForCommitment(commitment);
                      const explicit = !commitment.id.startsWith("legacy:");
                      return (
                        <div
                          key={commitment.id}
                          draggable={explicit || !!spec}
                          onDragStart={(e: DragEvent<HTMLDivElement>) => explicit ? startCommitmentDrag(e, commitment) : spec && startSpecDrag(e, spec)}
                          onDragEnd={() => setDragOverKey(null)}
                          style={style}
                          className="flex min-h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 text-left text-[11px] transition-[box-shadow,background-color] hover:shadow-[inset_0_0_0_1px_rgba(241,245,249,0.28)]"
                          title={`${commitment.workspace_name} · ${commitment.title}`}
                        >
                          <button type="button" onClick={() => spec && openSpec(spec)} className="min-w-0 flex-1 truncate text-left font-semibold text-slate-100">{commitment.title}</button>
                          {commitment.pipeline_status === "done" && <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-semibold text-emerald-300">파이프라인 완료</span>}
                          {spec && <SpecDeploymentBadge deployment={spec.deployment} title={commitment.title} />}
                          {overdue && (
                            <span className="flex shrink-0 items-center gap-0.5 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold text-rose-300">
                              <AlertTriangle size={9} /> 기한 초과
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {dayMemos.map((memo) => <div key={memo.id} draggable onDragStart={(event: DragEvent<HTMLDivElement>) => startMemoDrag(event, memo)} onDragEnd={() => setDragOverKey(null)} className="flex min-h-[26px] shrink-0 cursor-grab items-center gap-1.5 rounded-md border border-slate-400/45 bg-slate-400/[0.14] px-2 py-0.5 text-left text-[11px] text-slate-100 hover:bg-slate-400/20 active:cursor-grabbing" title={`메모 · ${memo.title}`}><FilePenLine size={10} className="shrink-0 text-slate-300" /><button type="button" onClick={() => setMemoTarget({ memo })} className="min-w-0 flex-1 truncate text-left">{memo.title}</button></div>)}
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
          onClose={() => {
            setSelected(null);
            setTitleDraft(null);
          }}
          disableEscape={!!checkpointTarget || !!canvasOverlay || !!specDocumentTarget}
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
                    {guidance.kind !== "done" && <>
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
              <section className="mt-3 rounded-xl border border-violet-400/25 bg-violet-400/[0.06] p-3" aria-label="작업 목표">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[12.5px] font-semibold text-violet-100">작업 목표</h3>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">이번에 끝낼 범위와 마감일을 관리합니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCommitmentTitle(selected.title);
                      setCommitmentDueDate(selected.due_date);
                      setCommitmentFormOpen((open) => !open);
                    }}
                    className="shrink-0 rounded-lg border border-violet-400/35 bg-violet-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-violet-200 hover:bg-violet-400/20"
                  >
                    작업 목표 추가
                  </button>
                </div>

                {selectedCommitments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedCommitments.map((commitment) => {
                      const action = commitmentNextAction(commitment);
                      const closed = commitment.state === "completed" || commitment.state === "cancelled";
                      return (
                        <div key={commitment.id} className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-white">{commitment.title}</p>
                              <p className="mt-1 text-[10.5px] font-semibold text-cyan-200">{action.label}</p>
                              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{action.detail}</p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[9.5px] text-slate-400">
                                <span>{commitment.due_date ?? "날짜 미정"}</span>
                                <span>목표 {commitment.target.toUpperCase()}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setCommitmentClosed(commitment, !closed)}
                              className={cn(
                                "shrink-0 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-semibold disabled:opacity-40",
                                closed
                                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
                                  : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20",
                              )}
                            >
                              {closed ? "다시 열기" : "완료 처리"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedCommitments.length === 0 && !commitmentFormOpen && (
                  <p className="mt-3 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-[10.5px] text-slate-400">
                    기존 마감일을 일정에 표시하고 있습니다. 작업 목표를 추가하면 완료 이력을 따로 관리할 수 있습니다.
                  </p>
                )}

                {commitmentFormOpen && (
                  <div className="mt-3 space-y-3 rounded-lg border border-violet-400/20 bg-black/20 p-3">
                    <label className="block text-[10.5px] text-slate-400">
                      작업 목표
                      <input
                        value={commitmentTitle}
                        onChange={(event) => setCommitmentTitle(event.target.value)}
                        className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-[12px] text-white"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-[10.5px] text-slate-400">
                        목표
                        <select
                          value={commitmentTarget}
                          onChange={(event) => setCommitmentTarget(event.target.value as CommitmentTarget)}
                          className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-[12px] text-white"
                        >
                          <option value="implementation">구현</option>
                          <option value="review">리뷰</option>
                          <option value="dev">DEV 배포</option>
                          <option value="stg">STG 배포</option>
                          <option value="prd">PRD 배포</option>
                          <option value="custom">사용자 정의</option>
                        </select>
                      </label>
                      <div>
                        <span className="mb-1 block text-[10.5px] text-slate-400">마감일</span>
                        <DatePicker value={commitmentDueDate} onChange={setCommitmentDueDate} placeholder="날짜 미정" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setCommitmentFormOpen(false)} className="rounded-lg px-3 py-1.5 text-[10.5px] text-slate-400 hover:bg-white/[0.04]">취소</button>
                      <button type="button" disabled={busy || !commitmentTitle.trim()} onClick={() => void addCommitment()} className="rounded-lg border border-violet-400/35 bg-violet-400/15 px-3 py-1.5 text-[10.5px] font-semibold text-violet-100 hover:bg-violet-400/25 disabled:opacity-40">작업 목표 추가</button>
                    </div>
                  </div>
                )}
              </section>
              {selected.spec_path && (
                <button
                  onClick={() => setSpecDocumentTarget({ workspace: selected.workspace_name, nodeId: selected.id, title: selected.title })}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-500/30 bg-slate-500/10 px-3 py-2.5 text-[12px] font-semibold text-slate-200 hover:bg-slate-500/20"
                >
                  <BookOpen size={14} /> {selected.has_run ? "SPEC 원문 읽기" : "SPEC 원문 읽기·수정"}
                </button>
              )}
            </div>

            <SpecAttachments workspace={selected.workspace_name} nodeId={selected.id} hasSpec={!!selected.spec_path} />

            <div>
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
                마감일
                {savedFlash === "due" && <span className="text-[10.5px] font-semibold text-emerald-400">저장됨</span>}
              </span>
              <DatePicker value={selected.due_date} onChange={(next) => void applyDueDate(selected, next)} />
            </div>

            <div>
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
                대상 프로젝트 · 선택하면 바로 저장됩니다
                {savedFlash === "project" && <span className="text-[10.5px] font-semibold text-emerald-400">저장됨</span>}
              </span>
              <select
                disabled={selected.has_run}
                value={selected.project_path ?? ""}
                onChange={(e) => void applyProject(selected, e.target.value || null)}
                className="block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[13px] text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">프로젝트 미지정</option>
                {selectedWorkspaceProjects.map((p) => (
                  <option key={p.project_path} value={p.project_path}>
                    {repoName(p.project_path)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
                작업 브랜치 · feat 시작 전에 준비합니다
                {savedFlash === "branch" && <span className="text-[10.5px] font-semibold text-emerald-400">저장됨</span>}
              </span>
              <input
                disabled={selected.has_run || !selected.project_path}
                value={branchDraft ?? selected.work_branch ?? ""}
                onChange={(event) => setBranchDraft(event.target.value)}
                onBlur={(event) => void applyWorkBranch(selected, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setBranchDraft(null);
                }}
                className="block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-[13px] font-mono text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">없으면 현재 브랜치에서 시작합니다.</p>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-slate-950/35 p-3">
              <div className="mb-2 text-[12px] font-semibold text-[var(--color-text-bright)]">SPEC → feat</div>
              {scheduleSpecStage(selected) !== "in_progress" && (
                <div className="grid grid-cols-2 gap-2">
                  {(["claude", "codex"] as SpecWriterProvider[]).map((provider) => (
                    <button
                      key={provider}
                      disabled={!selected.project_path}
                      onClick={() => void copyWorkflowCommand(`writer-${provider}`, buildSpecWriterCommand(selected, provider))}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[12px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copied === `writer-${provider}` ? <Check size={13} /> : <Copy size={13} />}
                      {provider === "claude" ? "Claude" : "Codex"}로 {selected.spec_path ? "다시 작성" : "SPEC 작성"}
                    </button>
                  ))}
                </div>
              )}
              {scheduleSpecStage(selected) === "ready" && (
                <button
                  onClick={() => void copyWorkflowCommand("feat", buildFeatCommand(selected))}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2.5 text-[12.5px] font-bold text-cyan-200 hover:bg-cyan-500/25"
                >
                  {copied === "feat" ? <Check size={14} /> : <Copy size={14} />} {copied === "feat" ? "feat 명령 복사됨" : "feat 명령 복사"}
                </button>
              )}
              {!selected.project_path && <p className="mt-2 text-[10.5px] text-amber-300">먼저 대상 프로젝트를 지정하세요.</p>}
              {selected.spec_path && <p className="mt-2 break-all font-mono text-[10px] text-[var(--color-text-dim)]">{selected.spec_path}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                disabled={!selected.project_path}
                onClick={() => {
                  if (!selected.project_path) return;
                  setCheckpointTarget({ workspace: selected.workspace_name, projectPath: selected.project_path, dueDate: selected.due_date });
                }}
                title={selected.project_path ? undefined : "먼저 위에서 대상 프로젝트를 지정해야 체크포인트를 관리할 수 있습니다"}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber-500/10"
              >
                <Shield size={14} /> {selected.project_path ? `${repoName(selected.project_path)} 프로젝트 체크포인트` : "프로젝트 지정 후 체크포인트 관리"}
              </button>
              <button
                onClick={() => setCanvasOverlay({ workspace: selected.workspace_name, nodeId: selected.focus_task_id ?? selected.id })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[12.5px] font-semibold text-cyan-300 hover:bg-cyan-500/20"
              >
                <Workflow size={14} /> Canvas에서 보기
              </button>
            </div>

            {selected.id.startsWith("spec-manual-") && (
              <div className="border-t border-rose-500/15 pt-4">
                {!deleteConfirm ? (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 size={13} /> SPEC 삭제
                  </button>
                ) : (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-3">
                    <p className="text-[12px] font-semibold text-rose-200">이 SPEC을 삭제할까요?</p>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-rose-100/60">
                      {selected.has_run ? "연결된 RUN과 Task 계보도 함께 삭제됩니다. " : "Schedule과 Canvas에서 제거됩니다. "}
                      로컬에 작성된 Markdown 파일은 삭제하지 않습니다.
                    </p>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        disabled={busy}
                        onClick={() => setDeleteConfirm(false)}
                        className="rounded-lg border border-slate-500/30 px-3 py-1.5 text-[11.5px] text-slate-300 hover:bg-slate-500/10"
                      >
                        취소
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void handleDeleteQuickSpec(selected)}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-[11.5px] font-bold text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
                      >
                        {busy ? "삭제 중…" : "SPEC과 계보 삭제"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 경량 Spec 추가(§7B "+ SPEC 일정 추가") */}
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--color-text-bright)]">SPEC 일정 추가</h2>
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
            <div className="space-y-2">
              <span className="block text-[12px] text-[var(--color-text-muted)]">기획 화면(선택) · spec-writer와 실행 에이전트가 함께 봅니다</span>
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

      {/* §7B 사용자 결정: 체크포인트/캔버스는 다른 화면으로 안 보내고 Schedule 위에 겹쳐서 연다.
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
