import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { buildMonthGrid, dayAccentClass, nowKST, toDateKey } from "../lib/calendar.js";
import { krHolidayName } from "../lib/krHolidays.js";
import { cn } from "../lib/utils.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * §7B Schedule 탭 — 사용자 결정(2026-09-23): 마감일은 `<input type="date">` 텍스트 입력이
 * 아니라 실제 달력을 눌러서 고르는 형태여야 한다. 팝오버 안에서 SchedulePage 본체와 같은
 * KST 기준 월 그리드(`lib/calendar.ts`)를 그대로 재사용한다.
 *
 * 패널은 body에 포털로 그린다 — 트리거가 (Modal처럼) `overflow-auto`인 조상 안에 있으면
 * `position:absolute`만으로는 팝오버가 그 조상 경계에서 잘린다(실제로 재현·확인함).
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "날짜 선택",
  allowClear = true,
  ariaLabel,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const initial = value ? new Date(`${value}T00:00:00`) : nowKST();
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // capture 단계에서 먼저 잡아 stopPropagation — 안 그러면 이 Escape가 그대로 버블링돼
      // 부모 Modal의 keydown 리스너까지 같이 타서 팝오버 대신 모달 전체가 닫혀버린다.
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reposition);
    // scroll은 버블링하지 않으므로 capture:true로 걸어야 Modal 내부 스크롤도 잡힌다.
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const todayKey = toDateKey(nowKST());

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-left text-[13px] text-[var(--color-text)]"
      >
        <CalendarDays size={14} className="text-[var(--color-text-dim)]" />
        {value ?? <span className="text-[var(--color-text-dim)]">{placeholder}</span>}
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`${ariaLabel ?? placeholder} 달력`}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-[100] w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-2xl"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
                className="rounded p-1 text-[var(--color-text-muted)] hover:text-cyan-300"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono text-[12.5px] font-bold text-[var(--color-text-bright)]">
                {cursor.year}.{String(cursor.month + 1).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
                className="rounded p-1 text-[var(--color-text-muted)] hover:text-cyan-300"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center font-mono text-[10px]">
              {WEEKDAY_LABELS.map((w, i) => (
                <div key={w} className={cn("py-0.5 text-[var(--color-text-dim)]", i === 0 && "text-rose-400", i === 6 && "text-blue-400")}>
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((day) => {
                const key = toDateKey(day);
                const inMonth = day.getMonth() === cursor.month;
                const holiday = krHolidayName(key);
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                    title={holiday ?? undefined}
                    className={cn(
                      "rounded py-1 text-center font-mono text-[11.5px] hover:bg-cyan-500/15",
                      !inMonth && "opacity-30",
                      key === value && "bg-cyan-500/25 font-bold text-cyan-200",
                      key === todayKey && key !== value && "ring-1 ring-cyan-400/60",
                      key !== value && dayAccentClass(day),
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            {allowClear && value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--color-border)] py-1 text-[11px] text-[var(--color-text-muted)] hover:text-rose-300"
              >
                <X size={12} /> 지우기
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
