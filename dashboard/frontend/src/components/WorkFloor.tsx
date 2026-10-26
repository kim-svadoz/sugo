import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

/** 4일 넘게 기록이 없는 레인에 장면 대신 보여 줄 문구. */
function idleMessageOf(lane: FloorLane, now: number): string {
  const { state } = lane;
  if (state.at === undefined) return "아직 작업 기록이 없습니다. 작업이 시작되면 장면이 열립니다.";
  const days = Math.floor((now - state.at) / (24 * 60 * 60_000));
  if (state.activity === "paused") return `${FLOOR_STATIONS.find((item) => item.id === state.station)!.label} 단계에서 멈춘 뒤 ${days}일 동안 기록이 없습니다.`;
  return `마지막 작업을 끝내고 쉬는 중입니다. ${days}일 동안 새 기록이 없습니다.`;
}

function headlineOf(lane: FloorLane): string {
  const { state } = lane;
  const station = FLOOR_STATIONS.find((item) => item.id === state.station)!;
  if (state.activity === "celebrating") return "작업을 끝냈습니다";
  if (state.activity === "waiting") return "사용자 확인을 기다리는 중";
  if (state.live) return station.working;
  if (state.activity === "paused") return `${station.label} 단계에서 멈춤`;
  return state.station === "commit" ? "마지막 작업을 끝내고 쉬는 중" : "새 작업을 기다리는 중";
}

function Lane({ lane, now, title, idleSummary }: { lane: FloorLane; now: number; title: ReturnType<typeof resolveTaskTitle>; idleSummary?: ReactNode }) {
  const idle = isFloorIdle(lane.state, now);
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
      <Pin size={15} strokeWidth={2.2} className="shrink-0 fill-rose-500/80 text-rose-500" aria-hidden="true" />
      <strong className="shrink-0 text-[13px] text-white" title={title.title}>{title.title}</strong>
      {title.kind && <span className="shrink-0 rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">{title.kind}</span>}
      {title.project && <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.08] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[10px] text-slate-400"><span aria-hidden="true">📦</span>{title.project}</span>}
      {!title.linked && <span className="shrink-0 text-[10px] text-amber-300">이력 연결 안 됨</span>}
      {!idle && <span className={`shrink-0 text-[11.5px] ${state.activity === "waiting" ? "text-violet-200" : state.live ? "text-cyan-200" : state.activity === "paused" ? "text-amber-200" : "text-slate-500"}`}>· {headlineOf(lane)}</span>}
      {state.at && <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500">{relativeTime(state.at, now)}</span>}
    </div>
    {idle ? <div className="mt-3 flex flex-col items-center text-center">
      <svg viewBox="0 -18 220 116" className="h-[104px] w-[198px]" role="img" aria-label="작업을 끝내고 쉬는 중">
        <rect x="6" y="88" width="208" height="4" rx="2" fill="#0f172a" />
        {/* 소파 */}
        <rect x="22" y="52" width="92" height="22" rx="7" fill="#1e3a5f" />
        <rect x="16" y="64" width="104" height="16" rx="6" fill="#244a73" />
        <rect x="24" y="80" width="5" height="9" fill="#0f172a" /><rect x="107" y="80" width="5" height="9" fill="#0f172a" />
        <g transform="translate(68 93)"><BlockPerson role="main" seated className="wk--resting" leftHand={<Mug />} /></g>
        {[0, 1, 2].map((index) => <text key={index} className="wk-zzz" x={92 + index * 9} y={10 - index * 9} fontSize={9 + index * 2} fontWeight="700" fill="#67e8f9" style={{ animationDelay: `${index * 0.6}s` }}>z</text>)}
        {/* 끝낸 작업: 출고 상자와 완료 깃발 */}
        <rect x="140" y="62" width="34" height="26" rx="2" fill="#a16207" /><rect x="140" y="62" width="34" height="7" fill="#ca8a04" /><rect x="154" y="62" width="6" height="26" fill="#fde68a" opacity="0.55" />
        <circle cx="173" cy="60" r="8" fill="#10b981" /><path d="M169 60 l3 3 l5 -6" stroke="#04281e" strokeWidth="2" fill="none" />
        <rect x="190" y="30" width="3" height="58" fill="#64748b" /><path d="M193 30 h18 l-5 6 l5 6 h-18 z" fill="#10b981" />
      </svg>
      <p className="mt-1.5 max-w-[34ch] break-keep text-[12.5px] leading-5 text-slate-400">{idleMessageOf(lane, now)}</p>
    </div> : <>
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
    </div></>}
    {idle && idleSummary && <div className="mt-3 border-t border-white/[0.06] pt-3">{idleSummary}</div>}
  </div>;
}

/** Workspaces의 코드 작업 흐름. 같은 도메인에서 동시에 진행 중인 작업은 작업별 레인으로 나눈다. */
export function WorkFloor({ workspace, selectedTaskKey, onSelectedTaskChange, onIdleChange, idleSummary }: { workspace: string; selectedTaskKey?: string | null; onSelectedTaskChange?: (taskKey: string) => void; onIdleChange?: (idle: boolean) => void; idleSummary?: ReactNode }) {
  const all = useActivityStream(workspace);
  const events = all.filter((event) => event.workspace_name === workspace);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const lanes = selectFloorLanes(events, now);
  const { data: specs } = useSchedule();
  const requestedIndex = selectedTaskKey ? lanes.findIndex((lane) => lane.key === selectedTaskKey) : -1;
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const lane = lanes[activeIndex];
  useEffect(() => { if (lane && lane.key !== selectedTaskKey) onSelectedTaskChange?.(lane.key); }, [lane, onSelectedTaskChange, selectedTaskKey]);
  // 선택된 레인이 쉬는 중이면 Workspaces가 작업장을 최근 작업 요약 위로 옮겨 한 줄기로 잇는다.
  // 레인이 없을 때(불러오는 중 포함)는 알리지 않는다. 알리면 배치가 바뀌며 다시 마운트되어 빈 상태를 반복한다.
  const idle = lane ? isFloorIdle(lane.state, now) : null;
  useEffect(() => { if (idle !== null) onIdleChange?.(idle); }, [idle, onIdleChange]);
  const title = lane ? resolveTaskTitle({ workspace: lane.workspace, taskId: lane.taskId, projectPath: lane.projectPath, name: lane.name, at: lane.state.at }, specs ?? []) : null;
  if (lanes.length === 0) return <div className="work-floor py-3 text-center text-[12px] text-slate-500">이 도메인에는 아직 작업 기록이 없습니다.</div>;
  const move = (delta: number) => onSelectedTaskChange?.(lanes[(activeIndex + delta + lanes.length) % lanes.length].key);
  return <div className="work-floor relative space-y-2 pb-1">
    {lanes.length > 1 && <div className="flex items-center justify-end gap-2"><span className="mr-1 text-[10px] text-slate-500">현재 작업 <strong className="font-mono text-cyan-200">{activeIndex + 1} / {lanes.length}</strong></span><button type="button" aria-label="이전 작업" onClick={() => move(-1)} className="rounded-md border border-white/10 p-1 text-slate-400 hover:text-cyan-200"><ChevronLeft size={14} /></button><button type="button" aria-label="다음 작업" onClick={() => move(1)} className="rounded-md border border-white/10 p-1 text-slate-400 hover:text-cyan-200"><ChevronRight size={14} /></button></div>}
    {title && <Lane lane={lane} now={now} title={title} idleSummary={idleSummary} />}
  </div>;
}
