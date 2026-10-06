import { SpecDeploymentBadge } from "../components/SpecDeploymentBadge.js";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { AlertTriangle, BookOpen, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Copy, Pencil, Shield, Trash2, Workflow } from "lucide-react";
import { cn } from "../lib/utils.js";
import { getWorkspaceColor, workspaceChipStyle } from "../lib/workspaceSelection.js";
import { buildMonthGrid, dayAccentClass, nowKST, toDateKey } from "../lib/calendar.js";
import { decodeScheduleDrag, encodeScheduleDrag, SCHEDULE_DRAG_TYPE } from "../lib/scheduleDrag.js";
import { daySpecOverflowClass, scheduleCardStyle } from "../lib/schedulePresentation.js";
import { krHolidayName } from "../lib/krHolidays.js";
import { Modal } from "../components/Modal.js";
import { CheckpointPanel } from "../components/CheckpointPanel.js";
import { AgentCanvasOverlay } from "../components/AgentCanvasOverlay.js";
import { DatePicker } from "../components/DatePicker.js";
import { SpecDocumentPanel } from "../components/SpecDocumentPanel.js";
import { ImagePasteZone, ImageThumb, SpecAttachments } from "../components/SpecAttachments.js";
import { BlockerDecisionPanel } from "../components/BlockerDecisionPanel.js";
import { useAuth } from "../auth/AuthContext.js";
import { useWorkspaces } from "../hooks/useWorkspaces.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { createQuickSpec, deleteQuickSpec, renameRoadmapNode, setDueDate, setProject, uploadSpecAttachment, type ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { buildFeatCommand, buildSpecWriterCommand, scheduleSpecStage, type SpecWriterProvider } from "../lib/scheduleSpecWorkflow.js";
import { scheduleAttention } from "../lib/taskGuidance.js";

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
  return <span className={cn("shrink-0 rounded px-1 py-0.5 font-semibold", compact ? "text-[8px]" : "text-[9px]", tone)}>{guidance.label}</span>;
}

export function SchedulePage() {
  const { userId } = useAuth();
  const { data: workspaces } = useWorkspaces();
  const { data: specs, loading, refetch } = useSchedule();

  const today = nowKST();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<ScheduledSpec | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addWorkspace, setAddWorkspace] = useState("");
  const [addProjectPath, setAddProjectPath] = useState("");
  const [addDate, setAddDate] = useState<string | null>(null);
  // 생성 전에는 SPEC id가 없으므로 붙여 넣은 화면을 들고 있다가 생성 직후 올린다.
  const [addImages, setAddImages] = useState<Array<{ file: File; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function openSpec(spec: ScheduledSpec) {
    setDeleteConfirm(false);
    setSelected(spec);
  }
  // 마감일/프로젝트 select는 클릭 즉시 저장되고 별도 "저장" 버튼이 없다 — 저장됐는지 눈에
  // 안 보이면 사용자가 헷갈린다(2026-09-23 사용자 피드백). 성공 시 잠깐 "저장됨"을 보여준다.
  const [savedFlash, setSavedFlash] = useState<"due" | "project" | "title" | null>(null);
  // Canvas의 이름 변경(✎)과 같은 API(renameRoadmapNode → manual_title)라 여기서 바꿔도
  // Canvas에 그대로 반영된다(2026-09-23 사용자 요청) — null이면 편집 중이 아님.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
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

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduledSpec[]>();
    for (const s of specs ?? []) {
      if (!s.due_date) continue;
      const list = map.get(s.due_date) ?? [];
      list.push(s);
      map.set(s.due_date, list);
    }
    return map;
  }, [specs]);

  const backlog = useMemo(() => (specs ?? []).filter((s) => !s.due_date), [specs]);

  // 왼쪽 패널: "기한 미정"만 보던 걸 "등록완료"(마감일이 잡힌 것)로도 전환할 수 있게 —
  // 마감일이 화면에 보이는 달을 벗어나 있으면(예: 오늘은 9월인데 마감은 10월) 달력만으론
  // 존재 자체를 놓친다.
  const [panelMode, setPanelMode] = useState<"backlog" | "scheduled">("backlog");
  const scheduledSorted = useMemo(
    () => (specs ?? []).filter((s) => s.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!)),
    [specs],
  );
  const openScheduledCount = useMemo(() => (specs ?? []).filter(isOpenStatus).length, [specs]);

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

  function flashSaved(field: "due" | "project" | "title") {
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
    e.dataTransfer.setData(SCHEDULE_DRAG_TYPE, encodeScheduleDrag({ workspaceName: spec.workspace_name, id: spec.id }));
  }

  function dropSpec(e: DragEvent<HTMLElement>, dueDate: string | null) {
    e.preventDefault();
    setDragOverKey(null);
    const payload = decodeScheduleDrag(e.dataTransfer.getData(SCHEDULE_DRAG_TYPE));
    if (!payload) return;
    const spec = (specs ?? []).find((item) => item.id === payload.id && item.workspace_name === payload.workspaceName);
    if (!spec || spec.due_date === dueDate) return;
    void applyDueDate(spec, dueDate);
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-bright)]">
            Schedule <span className="font-normal text-[var(--color-text-dim)]">({openScheduledCount})</span>
          </h1>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[12.5px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
        >
          <CalendarPlus size={15} /> SPEC 일정 추가
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">{errorMsg}</div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* 기한 미정 백로그 / 전체 목록 토글 */}
        <div
          className={cn(
            "ck-glass ck-card flex flex-col gap-2 overflow-auto p-3 transition-colors",
            dragOverKey === "backlog" && "border-cyan-400 bg-cyan-500/10",
          )}
          onDragOver={(e) => {
            if (panelMode !== "backlog") return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverKey("backlog");
          }}
          onDragLeave={() => setDragOverKey((key) => (key === "backlog" ? null : key))}
          onDrop={(e) => panelMode === "backlog" && dropSpec(e, null)}
        >
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-border)] p-0.5 text-[11px] font-semibold">
            <button
              onClick={() => setPanelMode("backlog")}
              className={cn("flex-1 rounded-md px-2 py-1 transition-colors", panelMode === "backlog" ? "bg-cyan-500/15 text-cyan-300" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]")}
            >
              기한 미정 · {backlog.length}
            </button>
            <button
              onClick={() => setPanelMode("scheduled")}
              className={cn("flex-1 rounded-md px-2 py-1 transition-colors", panelMode === "scheduled" ? "bg-cyan-500/15 text-cyan-300" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]")}
            >
              등록완료 · {scheduledSorted.length}
            </button>
          </div>

          {panelMode === "backlog" ? (
            <>
              {backlog.length === 0 && <p className="text-[11.5px] text-[var(--color-text-dim)]">없음. 여기 끌어다 놓으면 날짜가 풀립니다.</p>}
              {backlog.map((s) => {
                const style = scheduleCardStyle(colorOf(s.workspace_name));
                return (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={(e: DragEvent<HTMLDivElement>) => startSpecDrag(e, s)}
                    onDragEnd={() => setDragOverKey(null)}
                    onClick={() => openSpec(s)}
                    style={style}
                    className="flex min-h-9 cursor-grab items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12px] font-medium text-slate-100 transition-colors hover:brightness-110 active:cursor-grabbing"
                    title="캘린더 날짜 칸으로 끌어놓으면 마감일이 지정됩니다"
                  >
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <SpecStageBadge spec={s} />
                      <SpecDeploymentBadge deployment={s.deployment} title={s.title} />
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {scheduledSorted.length === 0 && <p className="text-[11.5px] text-[var(--color-text-dim)]">마감일이 지정된 SPEC이 없습니다.</p>}
              {scheduledSorted.map((s) => {
                const style = scheduleCardStyle(colorOf(s.workspace_name));
                const remaining = daysUntil(s.due_date!);
                const open = isOpenStatus(s);
                const overdue = remaining < 0 && open;
                // "3일보다 안 남은 애들은(3일 포함) 전부 기한임박" — 0~3일 남은 것만. 이미 지난 건 위의 기한 초과.
                const dueSoon = remaining >= 0 && remaining <= 3 && open;
                return (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={(e: DragEvent<HTMLDivElement>) => startSpecDrag(e, s)}
                    onDragEnd={() => setDragOverKey(null)}
                    onClick={() => {
                      openSpec(s);
                      jumpToDate(s.due_date!);
                    }}
                    style={style}
                    className="flex min-h-9 cursor-grab flex-col gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium text-slate-100 transition-colors hover:brightness-110 active:cursor-grabbing"
                    title="클릭하면 마감월로 이동합니다 · 캘린더 날짜 칸으로 끌어놓으면 마감일이 바뀝니다"
                  >
                    <span className="min-w-0 truncate">{s.title}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="font-mono text-[9.5px] text-slate-300/80">{s.due_date}</span>
                      <SpecStageBadge spec={s} />
                      <SpecDeploymentBadge deployment={s.deployment} title={s.title} />
                      {overdue && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300">
                          <AlertTriangle size={9} /> 기한 초과
                        </span>
                      )}
                      {dueSoon && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                          <Clock size={9} /> 기한임박 · D-{remaining}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* 월간 캘린더 (KST 기준, 주말/공휴일 표시) */}
        <div className="ck-glass ck-card flex min-h-0 flex-col overflow-hidden p-3">
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
              const isToday = key === todayKey;
              const holiday = krHolidayName(key);
              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => dropSpec(e, key)}
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
                    {dayChips.map((s) => {
                      const style = scheduleCardStyle(colorOf(s.workspace_name));
                      const overdue = key < todayKey && isOpenStatus(s);
                      return (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={(e: DragEvent<HTMLDivElement>) => startSpecDrag(e, s)}
                          onDragEnd={() => setDragOverKey(null)}
                          style={style}
                          className="flex min-h-[26px] shrink-0 cursor-grab items-center gap-1.5 rounded-md border px-2 py-0.5 text-left text-[11px] transition-[filter,background-color] hover:brightness-110 active:cursor-grabbing"
                          title={`${s.workspace_name} · ${s.title}`}
                        >
                          <button type="button" onClick={() => openSpec(s)} className="min-w-0 flex-1 truncate text-left font-medium text-slate-100" title={`${s.workspace_name} · ${s.title}`}>{s.title}</button>
                          <SpecStageBadge spec={s} compact />
                      <SpecDeploymentBadge deployment={s.deployment} title={s.title} />
                          {overdue && (
                            <span className="flex shrink-0 items-center gap-0.5 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold text-rose-300">
                              <AlertTriangle size={9} /> 기한 초과
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading && !specs && <p className="text-center text-[12px] text-[var(--color-text-dim)]">불러오는 중…</p>}

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
                      <strong className="font-semibold text-white">{guidance.kind === "done" ? "완료" : guidance.currentStage}</strong>
                      {guidance.kind !== "done" && <SpecStageBadge spec={selected} />}
                      <SpecDeploymentBadge deployment={selected.deployment} title={selected.title} />
                    </div>
                    {guidance.kind !== "done" && <>
                    <p className="mt-1 text-slate-300">{guidance.reason}</p>
                    <p className="mt-2"><span className="text-cyan-300">다음 행동</span> · {guidance.nextAction}</p>
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

            <div className="flex gap-2 pt-2">
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
