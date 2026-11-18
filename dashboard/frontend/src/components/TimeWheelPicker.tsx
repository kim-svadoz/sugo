import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fromWheelTime, HOURS_12, indexFromScroll, MERIDIEMS, MINUTES, toWheelTime, type WheelTime } from "../lib/timeWheel.js";
import { cn } from "../lib/utils.js";

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const EDGE_PADDING = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT;
const SETTLE_MS = 110;

function WheelColumn({ items, index, onChange, ariaLabel, className }: {
  items: readonly string[];
  index: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{ startY: number; startTop: number } | null>(null);
  const [liveIndex, setLiveIndex] = useState(index);

  useEffect(() => {
    const el = ref.current;
    if (!el || drag.current) return;
    if (indexFromScroll(el.scrollTop, ITEM_HEIGHT, items.length) !== index) el.scrollTop = index * ITEM_HEIGHT;
    setLiveIndex(index);
  }, [index, items.length]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // 부드러운 스크롤이 끝나기 전에 키를 연달아 누르면 아직 도착하지 않은 목표에서 이어 센다.
  const pendingTarget = useRef<number | null>(null);
  const scrollToIndex = (next: number) => {
    const target = Math.min(items.length - 1, Math.max(0, next));
    pendingTarget.current = target;
    ref.current?.scrollTo({ top: target * ITEM_HEIGHT, behavior: "smooth" });
  };

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const current = indexFromScroll(el.scrollTop, ITEM_HEIGHT, items.length);
    setLiveIndex(current);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (drag.current) return;
      pendingTarget.current = null;
      if (current !== index) onChange(current);
    }, SETTLE_MS);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = pendingTarget.current ?? liveIndex;
    const moves: Record<string, number> = { ArrowUp: from - 1, ArrowDown: from + 1, PageUp: from - 5, PageDown: from + 5, Home: 0, End: items.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    scrollToIndex(moves[event.key]);
  };

  // 터치·트랙패드·휠은 브라우저 스크롤이 그대로 처리한다. 마우스로 끌어 돌리는 것만 직접 옮긴다.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (event.pointerType !== "mouse" || !el) return;
    drag.current = { startY: event.clientY, startTop: el.scrollTop };
    el.style.scrollSnapType = "none";
    el.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!drag.current || !el) return;
    el.scrollTop = drag.current.startTop - (event.clientY - drag.current.startY);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const started = drag.current;
    if (!started || !el) return;
    drag.current = null;
    el.releasePointerCapture(event.pointerId);
    el.style.scrollSnapType = "";
    const moved = Math.abs(event.clientY - started.startY) > 3;
    if (moved) {
      scrollToIndex(indexFromScroll(el.scrollTop, ITEM_HEIGHT, items.length));
      return;
    }
    // 끌지 않고 누르기만 했으면 누른 줄로 이동한다.
    const fromCenter = event.clientY - el.getBoundingClientRect().top - EDGE_PADDING - ITEM_HEIGHT / 2;
    scrollToIndex(liveIndex + Math.round(fromCenter / ITEM_HEIGHT));
  };

  return <div
    ref={ref}
    role="listbox"
    aria-label={ariaLabel}
    aria-activedescendant={`${ariaLabel}-${liveIndex}`}
    tabIndex={0}
    onScroll={onScroll}
    onKeyDown={onKeyDown}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    className={cn("relative z-10 cursor-grab touch-pan-y select-none overflow-y-scroll overscroll-contain rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/40 active:cursor-grabbing", className)}
    style={{
      height: ITEM_HEIGHT * VISIBLE_ITEMS,
      paddingBlock: EDGE_PADDING,
      scrollSnapType: "y mandatory",
      scrollbarWidth: "none",
      maskImage: "linear-gradient(to bottom, transparent, black 32%, black 68%, transparent)",
      WebkitMaskImage: "linear-gradient(to bottom, transparent, black 32%, black 68%, transparent)",
    }}
  >
    {items.map((label, i) => {
      const distance = Math.abs(i - liveIndex);
      return <div
        key={label}
        id={`${ariaLabel}-${i}`}
        role="option"
        aria-selected={i === liveIndex}
        onClick={() => scrollToIndex(i)}
        className={cn(
          "flex items-center justify-center font-semibold tabular-nums transition-[color,transform,opacity] duration-150",
          distance === 0 ? "text-[19px] text-cyan-50" : distance === 1 ? "text-[16px] text-slate-400 opacity-80" : "text-[14px] text-slate-500 opacity-50",
        )}
        style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center" }}
      >{label}</div>;
    })}
  </div>;
}

const MERIDIEM_LABELS = MERIDIEMS.map((m) => (m === "am" ? "오전" : "오후"));
const HOUR_LABELS = HOURS_12.map(String);
const MINUTE_LABELS = MINUTES.map((m) => String(m).padStart(2, "0"));

/** 알람 설정처럼 오전/오후 · 시 · 분을 각각 굴려서 고른다. 값은 24시간제로 주고받는다. */
export function TimeWheelPicker({ hour, minute, onChange, className }: {
  hour: number;
  minute: number;
  onChange: (next: { hour: number; minute: number }) => void;
  className?: string;
}) {
  const time = toWheelTime(hour, minute);
  // 두 휠을 연달아 굴리면 먼저 멈춘 휠의 값이 반영된 뒤에 다음 휠이 멈춘다. 늘 최신 값에 덧붙인다.
  const latest = useRef(time);
  latest.current = time;
  const update = (patch: Partial<WheelTime>) => onChange(fromWheelTime({ ...latest.current, ...patch }));

  return <div className={cn("relative grid grid-cols-[1fr_1fr_1fr] gap-1 rounded-xl border border-white/[0.07] bg-[#070d18] px-2", className)}>
    <div aria-hidden className="pointer-events-none absolute inset-x-2 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06]" style={{ top: EDGE_PADDING, height: ITEM_HEIGHT }} />
    <WheelColumn ariaLabel="오전 오후" items={MERIDIEM_LABELS} index={MERIDIEMS.indexOf(time.meridiem)} onChange={(i) => update({ meridiem: MERIDIEMS[i] })} />
    <WheelColumn ariaLabel="시" items={HOUR_LABELS} index={HOURS_12.indexOf(time.hour12)} onChange={(i) => update({ hour12: HOURS_12[i] })} />
    <WheelColumn ariaLabel="분" items={MINUTE_LABELS} index={time.minute} onChange={(i) => update({ minute: MINUTES[i] })} />
  </div>;
}
