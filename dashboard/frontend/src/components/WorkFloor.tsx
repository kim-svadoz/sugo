import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { resolveTaskTitle } from "../lib/taskTitle.js";
import { FLOOR_STATIONS, selectFloorLanes, type FloorActivity, type FloorLane, type FloorStationId, isFloorIdle } from "../lib/workFloor.js";
import { BlockPerson, Mug } from "./BlockPerson.js";

export const C = { cyan: "#22d3ee", violet: "#a78bfa", amber: "#fbbf24", emerald: "#34d399", rose: "#fb7185", paper: "#e2e8f0", ink: "#64748b", steel: "#334155", bench: "#1e293b" };
const FLOOR_Y = 132;
const SPACING = 960 / FLOOR_STATIONS.length;
const benchX = (index: number) => 34 + index * SPACING;

export function relativeTime(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.round(hours / 24)}일 전`;
}

export function Brick({ x, y, w = 18, color, className, style }: { x: number; y: number; w?: number; color: string; className?: string; style?: React.CSSProperties }) {
  const studs = Math.max(1, Math.round(w / 9));
  return <g className={className} style={style}>
    {Array.from({ length: studs }, (_, index) => <rect key={index} x={x + (w / studs) * index + w / studs / 2 - 2.4} y={y - 2.6} width={4.8} height={3} rx={0.9} fill={color} />)}
    <rect x={x} y={y} width={w} height={9} rx={1.5} fill={color} />
    <rect x={x} y={y + 6.4} width={w} height={2.6} rx={1} fill="#000" opacity={0.2} />
  </g>;
}

export function heldItem(activity: FloorActivity, station: FloorStationId): ReactNode {
  if (activity === "celebrating") return <Brick x={12} y={-48} w={16} color={C.amber} />;
  if (activity !== "working") return null;
  if (station === "code") return <Brick x={14} y={-44} w={14} color={C.amber} />;
  if (station === "test") return <g><circle cx="29" cy="-52" r="6.5" stroke="#cbd5e1" strokeWidth="2.2" fill={C.cyan} fillOpacity="0.15" /><path d="M24.5 -47.5 L20 -40" stroke="#cbd5e1" strokeWidth="2.6" strokeLinecap="round" /></g>;
  if (station === "order") return <rect x="15" y="-50" width="11" height="13" rx="1" fill={C.paper} />;
  if (station === "commit") return <path d="M15 -36 h14" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />;
  return <path d="M18 -36 L30 -52" stroke={C.amber} strokeWidth="2.8" strokeLinecap="round" />;
}

/** 작업대 소품. Home 작업 세계도 같은 소품을 쓴다. x는 작업대 왼쪽, y는 바닥선이다. */
export function StationProp({ id, x, y, working, waiting = false }: { id: FloorStationId; x: number; y: number; working: boolean; waiting?: boolean }) {
  switch (id) {
    case "order":
      return <g>
        <rect x={x} y={y - 86} width="58" height="46" rx="3" fill="#0f172a" stroke="#334155" />
        {[0, 1, 2, 3].map((index) => <g key={index} className={working ? "wk-note" : undefined} style={{ animationDelay: `${index * 0.5}s` }}><rect x={x + 6 + (index % 2) * 26} y={y - 80 + Math.floor(index / 2) * 19} width="20" height="14" rx="1.5" fill={[C.cyan, C.emerald, C.violet, C.amber][index]} opacity="0.85" /><rect x={x + 9 + (index % 2) * 26} y={y - 75 + Math.floor(index / 2) * 19} width="12" height="2" fill="#0f172a" opacity="0.5" /></g>)}
        <rect x={x + 26} y={y - 40} width="6" height="40" fill={C.steel} />
      </g>;
    case "code":
      return <g>
        <rect x={x - 4} y={y - 6} width="70" height="6" rx="1.5" fill={C.bench} />
        {Array.from({ length: 9 }, (_, index) => <Brick key={index} className={working ? "wk-build" : undefined} style={{ animationDelay: `${index * 0.32}s` }} x={x + (index % 3) * 21 + (Math.floor(index / 3) % 2 ? 6 : 0)} y={y - 16 - Math.floor(index / 3) * 10} w={20} color={[C.cyan, C.violet, C.emerald, C.amber][index % 4]} />)}
      </g>;
    case "test":
      return <g>
        <rect x={x - 6} y={y - 30} width="76" height="5" rx="1.5" fill={C.steel} /><rect x={x} y={y - 25} width="4" height="25" fill={C.bench} /><rect x={x + 60} y={y - 25} width="4" height="25" fill={C.bench} />
        {[0, 1, 2].map((index) => <Brick key={index} x={x + index * 22} y={y - 40} w={18} color={[C.cyan, C.violet, C.amber][index]} />)}
        {[0, 1, 2].map((index) => <g key={index} className={working ? "wk-pass" : undefined} style={{ animationDelay: `${index * 0.9}s` }}><circle cx={x + 9 + index * 22} cy={y - 56} r="6" fill={C.emerald} /><path d={`M${x + 6 + index * 22} ${y - 56} l2.3 2.3 l4 -4.6`} stroke="#0f172a" strokeWidth="1.8" fill="none" /></g>)}
      </g>;
    case "review":
      return <g>
        <path d={`M${x + 4} ${y} L${x + 14} ${y - 50} H${x + 46} L${x + 56} ${y} Z`} fill={C.bench} />
        <rect x={x + 8} y={y - 84} width="44" height="40" rx="2" fill={C.paper} /><rect x={x + 22} y={y - 87} width="16" height="6" rx="2" fill={C.ink} />
        {[0, 1, 2].map((index) => <g key={index}><rect x={x + 13} y={y - 76 + index * 11} width="7" height="7" rx="1" fill="none" stroke={C.ink} /><path className={working ? "wk-tick" : undefined} style={{ animationDelay: `${index * 0.7}s` }} d={`M${x + 14} ${y - 72.5 + index * 11} l2 2 l4 -4.5`} stroke="#059669" strokeWidth="1.8" fill="none" /><rect x={x + 24} y={y - 74 + index * 11} width="22" height="2.5" rx="1" fill="#94a3b8" /></g>)}
      </g>;
    case "confirm":
      return <g>
        <rect x={x} y={y - 92} width="64" height="58" rx="4" fill="#0f172a" stroke={waiting ? C.violet : "#334155"} strokeWidth={waiting ? 2 : 1} />
        <rect x={x + 6} y={y - 86} width="52" height="40" rx="2" fill="#1e1b4b" opacity="0.7" />
        <circle cx={x + 32} cy={y - 72} r="7" fill="#c4b5fd" /><path d={`M${x + 20} ${y - 48} q12 -16 24 0 z`} fill="#c4b5fd" />
        <rect x={x - 4} y={y - 36} width="72" height="8" rx="2" fill={C.steel} />
        <rect x={x + 6} y={y - 28} width="52" height="28" fill={C.bench} />
        <g className={waiting ? "wk-bell" : undefined}><path d={`M${x + 48} ${y - 40} a6 6 0 0 1 12 0 z`} fill={C.amber} /><rect x={x + 53} y={y - 44} width="2" height="3" fill={C.amber} /></g>
      </g>;
    case "docs":
      return <g>
        <path d={`M${x} ${y - 70} h30 v44 h-30 z M${x + 30} ${y - 70} h30 v44 h-30 z`} fill={C.paper} /><rect x={x + 29} y={y - 70} width="2" height="44" fill="#94a3b8" />
        {[0, 1, 2, 3].map((index) => <rect key={index} className={working ? "wk-line" : undefined} style={{ animationDelay: `${index * 0.5}s` }} x={x + 35} y={y - 63 + index * 9} width="20" height="2.5" rx="1" fill={C.ink} />)}
        {[0, 1, 2].map((index) => <Brick key={index} x={x + 5 + index * 7} y={y - 40 - index * 8} w={9} color={[C.cyan, C.violet, C.amber][index]} />)}
        <path d={`M${x + 22} ${y - 26} L${x + 14} ${y} M${x + 38} ${y - 26} L${x + 46} ${y}`} stroke={C.steel} strokeWidth="3" />
      </g>;
    case "commit":
      return <g>
        <rect x={x} y={y - 34} width="44" height="34" rx="2" fill="#a16207" /><rect x={x} y={y - 34} width="44" height="8" fill="#ca8a04" /><rect x={x + 18} y={y - 34} width="8" height="34" fill="#fde68a" opacity="0.6" />
        <rect x={x + 56} y={y - 78} width="3" height="78" fill={C.steel} /><path className="wk-flag" d={`M${x + 59} ${y - 78} h24 l-6 8 l6 8 h-24 z`} fill={C.emerald} />
      </g>;
  }
}

/** 도메인에 진행 중인 작업이 없을 때: 파이프라인은 꺼 두고, 작업자는 시작점에서 다음 요청을 확인한다. */
function IdleFloor() {
  const dispatchX = 48;
  const pipelineOffset = 205;
  const pipelineScale = 0.84;
  return <svg viewBox="0 0 1200 174" preserveAspectRatio="xMidYMid meet" className="mt-1 block h-auto w-full" role="img" aria-label="진행 중인 파이프라인이 없어 작업 배정 데스크에서 다음 요청을 기다리는 중">
    <rect x="0" y={FLOOR_Y} width="1200" height="10" rx="3" fill="#0f172a" />
    <g transform={`translate(${pipelineOffset} ${FLOOR_Y * (1 - pipelineScale)}) scale(${pipelineScale})`} opacity="0.24" style={{ filter: "grayscale(1)" }}>
      {FLOOR_STATIONS.slice(0, -1).map((item, step) => <path key={item.id} d={`M${benchX(step) + 74} ${FLOOR_Y + 5} H${benchX(step + 1) - 26}`} stroke="#334155" strokeWidth="2" strokeDasharray="5 5" />)}
      {FLOOR_STATIONS.map((item, step) => <StationProp key={item.id} id={item.id} x={benchX(step)} y={FLOOR_Y} working={false} />)}
    </g>
    {FLOOR_STATIONS.map((item, step) => <text key={item.id} x={pipelineOffset + (benchX(step) + 26) * pipelineScale} y={FLOOR_Y + 30} textAnchor="middle" fontSize="12" fill="#475569">{item.label}</text>)}
    <path d={`M174 ${FLOOR_Y + 5} H${pipelineOffset + 10}`} stroke={C.cyan} strokeWidth="2" strokeDasharray="3 7" opacity="0.4" />
    <circle cx="184" cy={FLOOR_Y + 5} r="3" fill={C.cyan} opacity="0.75" className="wk-pass" />
    <g transform={`translate(${dispatchX} ${FLOOR_Y - 92})`}>
      <ellipse cx="61" cy="96" rx="70" ry="7" fill={C.cyan} opacity="0.12" />
      <rect x="0" y="23" width="60" height="38" rx="4" fill="#0f172a" stroke="#164e63" />
      <rect x="7" y="30" width="46" height="22" rx="2" fill="#082f49" />
      <circle cx="45" cy="34" r="2.5" fill={C.emerald} className="wk-pass" />
      <path d="M12 40 H36 M12 46 H29" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
      <rect x="24" y="61" width="12" height="7" rx="1" fill={C.steel} />
      <rect x="2" y="68" width="98" height="8" rx="2" fill={C.bench} />
      <rect x="9" y="76" width="6" height="20" fill="#172033" /><rect x="86" y="76" width="6" height="20" fill="#172033" />
      <g transform="translate(104 94)"><BlockPerson role="main" seated className="wk--resting" rightHand={<rect x="14" y="-48" width="15" height="12" rx="1" fill={C.paper} />} /></g>
    </g>
    <text x="109" y={FLOOR_Y + 30} textAnchor="middle" fontSize="12" fontWeight="600" fill="#a5f3fc">작업 배정 대기</text>
    <text x="720" y="24" textAnchor="middle" fontSize="11" fill="#475569">진행 중인 파이프라인 없음</text>
  </svg>;
}

function lastCompletionLabelOf(lastAt: number | undefined, now: number): string {
  if (lastAt === undefined) return "작업 기록 없음";
  return `마지막 완료 ${relativeTime(lastAt, now)}`;
}

function headlineOf(lane: FloorLane): string {
  const { state } = lane;
  const station = FLOOR_STATIONS.find((item) => item.id === state.station)!;
  if (state.activity === "celebrating") return "작업 완료";
  if (state.activity === "waiting") return "사용자 확인 대기";
  if (state.live) return `${station.label} 진행 중`;
  if (state.activity === "paused") return `${station.label}에서 멈춤`;
  return "새 작업 대기";
}

type WorksiteSignal = "idle" | "working" | "waiting" | "paused" | "complete";

function signalOf(lane: FloorLane): WorksiteSignal {
  if (lane.state.activity === "waiting") return "waiting";
  if (lane.state.activity === "paused") return "paused";
  if (lane.state.activity === "celebrating") return "complete";
  if (lane.state.live) return "working";
  return "idle";
}

const SIGNAL_STYLE: Record<WorksiteSignal, { frame: string; light: string; glow: boolean }> = {
  idle: { frame: "border-slate-600/70 bg-slate-800/45 text-slate-400", light: "bg-slate-400", glow: false },
  working: { frame: "border-cyan-400/45 bg-cyan-400/[0.08] text-cyan-200", light: "bg-cyan-300", glow: true },
  waiting: { frame: "border-violet-400/45 bg-violet-400/[0.08] text-violet-200", light: "bg-violet-300", glow: true },
  paused: { frame: "border-amber-400/45 bg-amber-400/[0.08] text-amber-200", light: "bg-amber-300", glow: false },
  complete: { frame: "border-emerald-400/45 bg-emerald-400/[0.08] text-emerald-200", light: "bg-emerald-300", glow: true },
};

/** 현실의 작업장 간판처럼 도메인 이름 앞에서 현재 운영 상태를 알린다. */
function WorksiteSign({ signal, label }: { signal: WorksiteSignal; label: string }) {
  const style = SIGNAL_STYLE[signal];
  const tooltipId = useId();
  return <span className="group/worksite-sign relative inline-flex shrink-0">
    <span className={`relative inline-flex h-6 w-7 items-center justify-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${style.frame}`} role="img" tabIndex={0} aria-label={`도메인 작업장 상태: ${label}`} aria-describedby={tooltipId}>
      <svg viewBox="0 0 20 18" width="17" height="15" aria-hidden="true">
        <path d="M5 6V3.5h10V6M3.5 6.5h13v8h-13z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M7 10h6M7 12.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
      </svg>
      <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0b1220] ${style.light} ${style.glow ? "animate-pulse shadow-[0_0_8px_currentColor]" : ""}`} aria-hidden="true" />
    </span>
    <span id={tooltipId} role="tooltip" className="pointer-events-none absolute left-0 top-full z-50 mt-2 translate-y-1 whitespace-nowrap rounded-lg border border-slate-600/80 bg-[#080f1b] px-2.5 py-1.5 text-[11px] font-medium text-slate-100 opacity-0 shadow-xl transition-all group-hover/worksite-sign:translate-y-0 group-hover/worksite-sign:opacity-100 group-focus-within/worksite-sign:translate-y-0 group-focus-within/worksite-sign:opacity-100">현재 상태 · {label}</span>
  </span>;
}

function TaskHeader({ title, at, now, children }: { title: ReturnType<typeof resolveTaskTitle>; at?: number; now: number; children?: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
    <Pin size={15} strokeWidth={2.2} className="shrink-0 fill-rose-500/80 text-rose-500" aria-hidden="true" />
    <strong className="shrink-0 text-[13px] text-white" title={title.title}>{title.title}</strong>
    {title.kind && <span className="shrink-0 rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">{title.kind}</span>}
    {title.project && <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.08] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[10px] text-slate-400"><span aria-hidden="true">📦</span>{title.project}</span>}
    {!title.linked && <span className="shrink-0 text-[10px] text-amber-300">이력 연결 안 됨</span>}
    {children}
    {at && <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500">{relativeTime(at, now)}</span>}
  </div>;
}

function Lane({ lane, now }: { lane: FloorLane; now: number }) {
  const { state } = lane;
  const index = FLOOR_STATIONS.findIndex((station) => station.id === state.station);
  const [walking, setWalking] = useState(false);
  const previous = useRef(state.station);
  useEffect(() => {
    if (previous.current === state.station) return;
    previous.current = state.station;
    setWalking(true);
    const timer = window.setTimeout(() => setWalking(false), 1600);
    return () => window.clearTimeout(timer);
  }, [state.station]);
  const poseClass = `wk--${state.activity} wk--at-${state.station} ${walking ? "wk--walking" : ""}`;

  return <div className="work-floor__lane">
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <WorksiteSign signal={signalOf(lane)} label={headlineOf(lane)} />
      <strong className="shrink-0 text-[13px] text-white">{lane.workspace}</strong>
      <span className={`shrink-0 text-[11.5px] ${state.activity === "waiting" ? "text-violet-200" : state.live ? "text-cyan-200" : state.activity === "paused" ? "text-amber-200" : "text-slate-500"}`}>· {headlineOf(lane)}</span>
      {state.at && <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500">{relativeTime(state.at, now)}</span>}
    </div>
    <div className="mx-auto w-full max-w-[88%]">
    <svg viewBox="0 0 960 150" preserveAspectRatio="xMidYMid meet" className="mt-1 block h-auto w-full" role="img" aria-label={`${lane.name} · ${headlineOf(lane)}`}>
      <rect x="0" y={FLOOR_Y} width="960" height="10" rx="3" fill="#0f172a" />
      {FLOOR_STATIONS.slice(0, -1).map((item, step) => <path key={item.id} d={`M${benchX(step) + 74} ${FLOOR_Y + 5} H${benchX(step + 1) - 26}`} stroke={state.passed.includes(item.id) ? C.emerald : "#334155"} strokeWidth="2" strokeDasharray="5 5" />)}
      {FLOOR_STATIONS.map((item, step) => {
        const active = item.id === state.station;
        return <g key={item.id} className={`wk-station ${active ? "wk-station--active" : ""}`}>
          {active && <ellipse cx={benchX(step) + 26} cy={FLOOR_Y + 4} rx="62" ry="7" fill={state.activity === "waiting" ? C.violet : C.cyan} opacity="0.16" />}
          <StationProp id={item.id} x={benchX(step)} y={FLOOR_Y} working={active && (state.activity === "working" || state.activity === "celebrating")} waiting={active && state.activity === "waiting"} />
          {state.passed.includes(item.id) && <g><circle cx={benchX(step) + 60} cy={FLOOR_Y - 104} r="7" fill={C.emerald} /><path d={`M${benchX(step) + 57} ${FLOOR_Y - 104} l2.2 2.3 l4.2 -4.6`} stroke="#0f172a" strokeWidth="1.8" fill="none" /></g>}
        </g>;
      })}
      <g className="wk-mover" style={{ transform: `translate(${benchX(index) - 24}px, ${FLOOR_Y}px)` }}>
        <BlockPerson role="main" className={poseClass} rightHand={heldItem(state.activity, state.station)} leftHand={state.activity === "resting" ? <Mug /> : undefined}
          extra={state.activity === "waiting" ? <g className="wk-bubble"><rect x="-4" y="-124" width="26" height="20" rx="6" fill={C.violet} /><path d="M2 -104 l-3 6 l8 -6 z" fill={C.violet} /><text x="9" y="-109.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">?</text></g>
            : state.activity === "paused" ? <g className="wk-bubble"><rect x="-4" y="-124" width="26" height="20" rx="6" fill={C.steel} /><path d="M2 -104 l-3 6 l8 -6 z" fill={C.steel} /><rect x="4" y="-119" width="3.4" height="10" rx="1" fill={C.paper} /><rect x="11" y="-119" width="3.4" height="10" rx="1" fill={C.paper} /></g> : undefined} />
      </g>
    </svg>
    <div className="grid grid-cols-7 gap-1.5">
      {FLOOR_STATIONS.map((item) => {
        const last = state.lastAt[item.id];
        const active = item.id === state.station;
        return <div key={item.id} title={last ? `${last.message} · ${relativeTime(last.at, now)}` : "이번 차수에 기록 없음"} className={`rounded-md px-1.5 py-1 text-center ${active ? "bg-cyan-300/[0.08] ring-1 ring-inset ring-cyan-300/25" : ""}`}>
          <div className={`truncate text-[11.5px] font-semibold ${active ? "text-cyan-100" : state.passed.includes(item.id) ? "text-emerald-300" : "text-slate-400"}`}>{item.label}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{last ? relativeTime(last.at, now) : "—"}</div>
        </div>;
      })}
    </div>
    </div>
  </div>;
}

/** 도메인 선택 보드용 축소 작업장. 전체 작업장과 같은 소품·작업자·상태 계산을 사용한다. */
export function WorkFloorPreview({ workspace }: { workspace: string }) {
  const all = useActivityStream(workspace);
  const now = Date.now();
  const lanes = selectFloorLanes(all.filter((event) => event.workspace_name === workspace), now);
  const lane = lanes[0];

  if (!lane) {
    return <svg viewBox="0 0 960 154" preserveAspectRatio="xMidYMid meet" className="block h-full w-full" role="img" aria-label={`${workspace} · 작업 기록 대기`}>
      <rect x="0" y={FLOOR_Y} width="960" height="10" rx="3" fill="#0f172a" />
      <g opacity="0.38" style={{ filter: "grayscale(1)" }}>
        {FLOOR_STATIONS.slice(0, -1).map((item, step) => <path key={item.id} d={`M${benchX(step) + 74} ${FLOOR_Y + 5} H${benchX(step + 1) - 26}`} stroke="#334155" strokeWidth="2" strokeDasharray="5 5" />)}
        {FLOOR_STATIONS.map((item, step) => <StationProp key={item.id} id={item.id} x={benchX(step)} y={FLOOR_Y} working={false} />)}
      </g>
      <g style={{ transform: `translate(${benchX(0) - 24}px, ${FLOOR_Y}px)` }}><BlockPerson role="main" className="wk--resting wk--at-order" leftHand={<Mug />} /></g>
      {FLOOR_STATIONS.map((item, step) => <text key={item.id} x={benchX(step) + 26} y="153" textAnchor="middle" fontSize="11" fontWeight="600" fill="#64748b">{item.label}</text>)}
    </svg>;
  }

  const { state } = lane;
  const idle = lanes.every((item) => isFloorIdle(item.state, now));
  const index = Math.max(0, FLOOR_STATIONS.findIndex((station) => station.id === state.station));
  const poseClass = `wk--${idle ? "resting" : state.activity} wk--at-${state.station}`;

  return <svg viewBox="0 0 960 154" preserveAspectRatio="xMidYMid meet" className="block h-full w-full" role="img" aria-label={`${workspace} · ${idle ? "새 작업 대기" : headlineOf(lane)}`}>
    <rect x="0" y={FLOOR_Y} width="960" height="10" rx="3" fill="#0f172a" />
    {FLOOR_STATIONS.slice(0, -1).map((item, step) => <path key={item.id} d={`M${benchX(step) + 74} ${FLOOR_Y + 5} H${benchX(step + 1) - 26}`} stroke={!idle && state.passed.includes(item.id) ? C.emerald : "#334155"} strokeWidth="2" strokeDasharray="5 5" opacity={idle ? 0.45 : 1} />)}
    <g opacity={idle ? 0.38 : 1} style={idle ? { filter: "grayscale(1)" } : undefined}>
      {FLOOR_STATIONS.map((item, step) => {
        const active = !idle && item.id === state.station;
        return <g key={item.id}>
          {active && <ellipse cx={benchX(step) + 26} cy={FLOOR_Y + 4} rx="62" ry="7" fill={state.activity === "waiting" ? C.violet : C.cyan} opacity="0.16" />}
          <StationProp id={item.id} x={benchX(step)} y={FLOOR_Y} working={active && (state.activity === "working" || state.activity === "celebrating")} waiting={active && state.activity === "waiting"} />
          {!idle && state.passed.includes(item.id) && <g><circle cx={benchX(step) + 60} cy={FLOOR_Y - 104} r="7" fill={C.emerald} /><path d={`M${benchX(step) + 57} ${FLOOR_Y - 104} l2.2 2.3 l4.2 -4.6`} stroke="#0f172a" strokeWidth="1.8" fill="none" /></g>}
        </g>;
      })}
    </g>
    <g className="wk-mover" style={{ transform: `translate(${benchX(idle ? 0 : index) - 24}px, ${FLOOR_Y}px)` }}>
      <BlockPerson role="main" className={poseClass} rightHand={idle ? undefined : heldItem(state.activity, state.station)} leftHand={idle ? <Mug /> : undefined} />
    </g>
    {FLOOR_STATIONS.map((item, step) => <text key={item.id} x={benchX(step) + 26} y="153" textAnchor="middle" fontSize="11" fontWeight="600" fill={!idle && item.id === state.station ? "#a5f3fc" : "#64748b"}>{item.label}</text>)}
  </svg>;
}

/** Workspaces의 코드 작업 흐름. 같은 도메인에서 동시에 진행 중인 작업은 작업별 레인으로 나눈다. */
export function WorkFloor({ workspace, selectedTaskKey, onSelectedTaskChange, onIdleChange }: { workspace: string; selectedTaskKey?: string | null; onSelectedTaskChange?: (taskKey: string) => void; onIdleChange?: (idle: boolean) => void }) {
  const all = useActivityStream(workspace);
  const events = all.filter((event) => event.workspace_name === workspace);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const lanes = selectFloorLanes(events, now);
  const requestedIndex = selectedTaskKey ? lanes.findIndex((lane) => lane.key === selectedTaskKey) : -1;
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const lane = lanes[activeIndex];
  useEffect(() => { if (lane && lane.key !== selectedTaskKey) onSelectedTaskChange?.(lane.key); }, [lane, onSelectedTaskChange, selectedTaskKey]);
  // 선택된 레인이 대기 중이면 Workspaces가 작업장을 최근 작업 요약 위로 옮겨 한 줄기로 잇는다.
  // 레인이 없을 때(불러오는 중 포함)는 알리지 않는다. 알리면 배치가 바뀌며 다시 마운트되어 빈 상태를 반복한다.
  // 도메인의 모든 작업이 대기 중일 때만 대기 배치로 바꾼다. 다른 작업이 진행 중이면 지난 작업을 골라도 장면을 보여 준다.
  const idle = lanes.length > 0 ? lanes.every((item) => isFloorIdle(item.state, now)) : null;
  const lastAt = lanes.reduce<number | undefined>((latest, item) => item.state.at !== undefined && (latest === undefined || item.state.at > latest) ? item.state.at : latest, undefined);
  useEffect(() => { if (idle !== null) onIdleChange?.(idle); }, [idle, onIdleChange]);
  if (lanes.length === 0) return <div className="work-floor py-3 text-center text-[12px] text-slate-500">이 도메인에는 아직 작업 기록이 없습니다.</div>;
  // 작업장 머리는 도메인 상태만 보여 준다. 고른 작업의 제목과 넘김은 아래 최근 작업 요약 카드(FloorTaskHeader)가 맡는다.
  if (idle) return <div className="work-floor relative pb-1">
    <div className="flex items-center gap-2.5">
      <WorksiteSign signal="idle" label="새 작업 대기" />
      <strong className="text-[13px] text-white">{workspace}</strong>
      <span className="shrink-0 text-[11.5px] text-cyan-200">· 새 작업 대기</span>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-400">{lastCompletionLabelOf(lastAt, now)}</span>
    </div>
    <div className="mx-auto w-full max-w-[88%]"><IdleFloor /></div>
  </div>;
  return <div className="work-floor relative space-y-2 pb-1">
    <Lane lane={lane} now={now} />
  </div>;
}

/** 최근 작업 요약 카드 맨 위의 작업 머리. 여러 작업이면 넘겨 보고, 위 작업장 장면도 같은 작업으로 바뀐다. */
export function FloorTaskHeader({ workspace, selectedTaskKey, onSelectedTaskChange }: { workspace: string; selectedTaskKey?: string | null; onSelectedTaskChange?: (taskKey: string) => void }) {
  const all = useActivityStream(workspace);
  const now = Date.now();
  const lanes = selectFloorLanes(all.filter((event) => event.workspace_name === workspace), now);
  const { data: specs } = useSchedule();
  const index = Math.max(0, selectedTaskKey ? lanes.findIndex((lane) => lane.key === selectedTaskKey) : 0);
  const lane = lanes[index];
  if (!lane) return null;
  const title = resolveTaskTitle({ workspace: lane.workspace, taskId: lane.taskId, projectPath: lane.projectPath, name: lane.name, at: lane.state.at }, specs ?? []);
  const move = (delta: number) => onSelectedTaskChange?.(lanes[(index + delta + lanes.length) % lanes.length].key);
  return <div className="mb-2 border-b border-white/[0.06] pb-2.5">
    <TaskHeader title={title} at={lane.state.at} now={now}>
      {lanes.length > 1 && <span className="flex items-center gap-1"><button type="button" aria-label="이전 작업" onClick={() => move(-1)} className="rounded-md border border-white/10 p-0.5 text-slate-400 hover:text-cyan-200"><ChevronLeft size={13} /></button><span className="font-mono text-[10px] text-slate-500">{index + 1}/{lanes.length}</span><button type="button" aria-label="다음 작업" onClick={() => move(1)} className="rounded-md border border-white/10 p-0.5 text-slate-400 hover:text-cyan-200"><ChevronRight size={13} /></button></span>}
    </TaskHeader>
  </div>;
}
