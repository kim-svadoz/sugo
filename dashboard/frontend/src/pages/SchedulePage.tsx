import { useMemo, useState, type DragEvent } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Shield, Workflow } from "lucide-react";
import { cn } from "../lib/utils.js";
import { getWorkspaceColor, workspaceChipStyle } from "../lib/workspaceSelection.js";
import { buildMonthGrid, dayAccentClass, nowKST, toDateKey } from "../lib/calendar.js";
import { krHolidayName } from "../lib/krHolidays.js";
import { Modal } from "../components/Modal.js";
import { CheckpointPanel } from "../components/CheckpointPanel.js";
import { AgentCanvasOverlay } from "../components/AgentCanvasOverlay.js";
import { DatePicker } from "../components/DatePicker.js";
import { useAuth } from "../auth/AuthContext.js";
import { useWorkspaces } from "../hooks/useWorkspaces.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { createQuickSpec, setDueDate, type ScheduledSpec } from "../api/roadmapMutationsApi.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 표류(dropped)를 제외한 "미완료"만 마감 임박/초과 강조 대상으로 본다. */
function isOpenStatus(spec: ScheduledSpec): boolean {
  return spec.status !== "done" && spec.status !== "dropped";
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
  const [addDate, setAddDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // §7B 사용자 결정(2026-09-23): 체크포인트/캔버스는 다른 화면으로 리다이렉트하지 않고
  // Schedule 위에 겹쳐서 뜬다 — Esc를 누르면 그냥 이 오버레이만 닫히고 Schedule로 남는다.
  const [checkpointWorkspace, setCheckpointWorkspace] = useState<string | null>(null);
  const [canvasOverlay, setCanvasOverlay] = useState<{ workspace: string; nodeId: string } | null>(null);

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

  async function applyDueDate(spec: ScheduledSpec, dueDate: string | null) {
    if (!userId) return;
    setErrorMsg(null);
    try {
      await setDueDate(userId, spec.workspace_name, spec.id, dueDate);
      refetch();
      if (selected?.id === spec.id) setSelected({ ...spec, due_date: dueDate });
    } catch {
      setErrorMsg("날짜 저장에 실패했습니다. Run/Task가 아닌 Spec인지 확인하세요.");
    }
  }

  async function handleAddQuickSpec() {
    if (!userId || !addTitle.trim() || !addWorkspace) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await createQuickSpec(userId, addWorkspace, addTitle.trim(), addDate);
      setAddOpen(false);
      setAddTitle("");
      setAddDate(null);
      refetch();
    } catch {
      setErrorMsg("일정 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-bright)]">Schedule</h1>
          <p className="text-[var(--color-text-muted)]">여러 워크스페이스의 Spec 마감일을 한 곳에서 확인합니다.</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[12.5px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
        >
          <CalendarPlus size={15} /> 일정 추가
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-300">{errorMsg}</div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* 기한 미정 백로그 */}
        <div className="ck-glass ck-card flex flex-col gap-2 overflow-auto p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">기한 미정 · {backlog.length}</span>
          </div>
          {backlog.length === 0 && <p className="text-[11.5px] text-[var(--color-text-dim)]">없음. 여기 끌어다 놓으면 날짜가 풀립니다.</p>}
          {backlog.map((s) => {
            const style = workspaceChipStyle(colorOf(s.workspace_name));
            return (
              <div
                key={s.id}
                draggable
                onDragStart={(e: DragEvent<HTMLDivElement>) => e.dataTransfer.setData("text/spec-id", `${s.workspace_name}::${s.id}`)}
                onClick={() => setSelected(s)}
                style={style}
                className="cursor-grab rounded-lg border px-2 py-1.5 text-[12px] active:cursor-grabbing"
                title="캘린더 날짜 칸으로 끌어놓으면 마감일이 지정됩니다"
              >
                {s.title}
              </div>
            );
          })}
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

          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1 overflow-auto">
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
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverKey(null);
                    const raw = e.dataTransfer.getData("text/spec-id");
                    const [workspace_name, id] = raw.split("::");
                    const spec = (specs ?? []).find((s) => s.id === id && s.workspace_name === workspace_name);
                    if (spec) void applyDueDate(spec, key);
                  }}
                  className={cn(
                    "flex flex-col gap-1 overflow-hidden rounded-lg border p-1.5 text-left",
                    inMonth ? "border-[var(--color-border)] bg-[var(--color-background)]" : "border-transparent opacity-40",
                    isToday && "ring-1 ring-cyan-400/60",
                    dragOverKey === key && "border-cyan-400 bg-cyan-500/10",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className={cn("font-mono text-[11px]", isToday ? "font-bold text-cyan-300" : dayAccentClass(day))}>
                      {day.getDate()}
                    </span>
                    {holiday && <span className="truncate text-[9px] text-rose-400" title={holiday}>{holiday}</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 overflow-auto">
                    {dayChips.map((s) => {
                      const style = workspaceChipStyle(colorOf(s.workspace_name));
                      const overdue = key < todayKey && isOpenStatus(s);
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelected(s)}
                          style={style}
                          className={cn(
                            "truncate rounded border px-1.5 py-0.5 text-left text-[11px]",
                            overdue && "ring-1 ring-rose-400",
                          )}
                          title={`${s.workspace_name} · ${s.title}`}
                        >
                          {s.title}
                        </button>
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
        <Modal onClose={() => setSelected(null)} disableEscape={!!checkpointWorkspace || !!canvasOverlay}>
          <div className="space-y-4">
            <div>
              <span
                className="inline-block rounded-full border px-2 py-0.5 text-[11px]"
                style={workspaceChipStyle(colorOf(selected.workspace_name))}
              >
                {selected.workspace_name}
              </span>
              <h2 className="mt-2 text-lg font-bold text-[var(--color-text-bright)]">{selected.title}</h2>
              <p className="font-mono text-[11px] text-[var(--color-text-dim)]">{selected.id} · {selected.status}</p>
            </div>

            <div>
              <span className="mb-1 block text-[12px] text-[var(--color-text-muted)]">마감일</span>
              <DatePicker value={selected.due_date} onChange={(next) => void applyDueDate(selected, next)} />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setCheckpointWorkspace(selected.workspace_name)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                <Shield size={14} /> 체크포인트 관리
              </button>
              <button
                onClick={() => setCanvasOverlay({ workspace: selected.workspace_name, nodeId: selected.id })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[12.5px] font-semibold text-cyan-300 hover:bg-cyan-500/20"
              >
                <Workflow size={14} /> Canvas에서 보기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 경량 Spec 추가(§7B "+ 일정 추가") */}
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--color-text-bright)]">일정 추가</h2>
            <p className="text-[12px] text-[var(--color-text-muted)]">
              Run/Task 없이 제목과 마감일만 먼저 잡아둡니다. 나중에 실제로 feat를 시작하면 이 Spec으로 편입할 수 있습니다.
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
                onChange={(e) => setAddWorkspace(e.target.value)}
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
            <div>
              <span className="mb-1 block text-[12px] text-[var(--color-text-muted)]">마감일(선택)</span>
              <DatePicker value={addDate} onChange={setAddDate} placeholder="선택 안 함" />
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
                추가
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* §7B 사용자 결정: 체크포인트/캔버스는 다른 화면으로 안 보내고 Schedule 위에 겹쳐서 연다.
          Esc를 누르면 이 오버레이만 닫히고 Schedule로 그대로 남는다. */}
      {checkpointWorkspace && (
        <CheckpointPanel workspace={checkpointWorkspace} onClose={() => setCheckpointWorkspace(null)} />
      )}
      {canvasOverlay && (
        <AgentCanvasOverlay
          workspace={canvasOverlay.workspace}
          focusNodeId={canvasOverlay.nodeId}
          onClose={() => setCanvasOverlay(null)}
        />
      )}
    </div>
  );
}
