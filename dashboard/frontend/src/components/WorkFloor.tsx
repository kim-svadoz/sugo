import { useEffect, useRef, useState, type ReactNode } from "react";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { FLOOR_STATIONS, selectFloorState, type FloorActivity, type FloorStationId } from "../lib/workFloor.js";

const C = { cyan: "#22d3ee", violet: "#a78bfa", amber: "#fbbf24", emerald: "#34d399", rose: "#fb7185", paper: "#e2e8f0", ink: "#64748b", steel: "#334155", bench: "#1e293b" };
const FLOOR_Y = 132;
const SPACING = 160;
const stationX = (index: number) => 56 + index * SPACING;

function relative(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.round(hours / 24)}일 전`;
}

function Brick({ x, y, w = 18, color, className, style }: { x: number; y: number; w?: number; color: string; className?: string; style?: React.CSSProperties }) {
  const studs = Math.max(1, Math.round(w / 9));
  return <g className={className} style={style}>
    {Array.from({ length: studs }, (_, index) => <rect key={index} x={x + (w / studs) * index + w / studs / 2 - 2.4} y={y - 2.6} width={4.8} height={3} rx={0.9} fill={color} />)}
    <rect x={x} y={y} width={w} height={9} rx={1.5} fill={color} />
    <rect x={x} y={y + 6.4} width={w} height={2.6} rx={1} fill="#000" opacity={0.2} />
  </g>;
}

/** 이름 없는 AI 작업자. 발 중앙이 (0,0)이다. */
function Worker({ activity, station, walking, held }: { activity: FloorActivity; station: FloorStationId; walking: boolean; held: ReactNode }) {
  return <g className={`wk wk--${activity} wk--at-${station} ${walking ? "wk--walking" : ""}`}>
    <g className="wk-body">
      <g transform="translate(-7 -31)"><g className="wk-leg wk-leg-l"><rect x="-6" y="0" width="12.5" height="27" rx="2" fill="#475569" /><rect x="-7" y="25" width="14" height="6" rx="2" fill="#1e293b" /></g></g>
      <g transform="translate(6.5 -31)"><g className="wk-leg wk-leg-r"><rect x="-6" y="0" width="12.5" height="27" rx="2" fill="#3f4b5e" /><rect x="-6.5" y="25" width="14" height="6" rx="2" fill="#1e293b" /></g></g>
      <rect x="-14.5" y="-36" width="29" height="6" rx="1.5" fill="#1e293b" />
      <rect x="-2" y="-35.5" width="4" height="5" rx="1" fill="#94a3b8" />
      <rect x="8" y="-38" width="7" height="8" rx="1.5" fill="#92400e" />
      <path d="M-13 -64 H13 L15.5 -36 H-15.5 Z" fill="#0e7490" />
      <path d="M-6 -64 L0 -57 L6 -64" fill="#155e75" />
      <path d="M0 -57 V-37" stroke="#155e75" strokeWidth="1.4" />
      <path d="M-6 -63 L-5 -52 M5 -63 L4 -54" stroke="#cbd5e1" strokeWidth="0.9" />
      <rect x="-9.5" y="-53" width="7.5" height="10" rx="1.2" fill={C.paper} />
      <rect x="-9.5" y="-53" width="7.5" height="2.6" rx="1" fill={C.cyan} />
      <rect x="-8" y="-48" width="4.5" height="1.2" fill={C.ink} />
      <rect x="-4" y="-67.5" width="8" height="3.5" fill="#d4a72c" />
      <rect x="-12.5" y="-91" width="25" height="24" rx="6.5" fill="#f5c542" />
      <path d="M-13.5 -80 q-1 -17 13.5 -17 q15 0 14 15 l-4 -4 q-6 5 -15 0 q-3 5 -8.5 6 z" fill="#3b2a1f" />
      <path d="M-15 -78 q0 -22 15 -22 q15 0 15 22" stroke="#475569" strokeWidth="2.6" fill="none" />
      <rect x="11.5" y="-84" width="6" height="11" rx="2.5" fill={C.steel} />
      <circle cx="14.5" cy="-78.5" r="1.4" fill={C.cyan} className="wk-led" />
      <path d="M14 -74 q-2 5 -8 5.5" stroke="#475569" strokeWidth="1.6" fill="none" />
      <circle cx="5.5" cy="-68.5" r="1.8" fill={C.steel} />
      <g className="wk-eyes"><rect x="-7" y="-80" width="3.4" height="4.4" rx="1.6" fill="#0f172a" /><rect x="3.4" y="-80" width="3.4" height="4.4" rx="1.6" fill="#0f172a" /></g>
      <path d="M-7.5 -83 h4 M3 -83 h4" stroke="#78350f" strokeWidth="1.1" strokeLinecap="round" />
      <path className="wk-mouth" d="M-3.6 -72.5 q3.6 2.6 7.2 0" stroke="#0f172a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <g transform="translate(-13 -62)"><g className="wk-arm wk-arm-l"><path d="M0 -1 l-7 4 l-3 18 l7 1 l4 -15 z" fill="#0e7490" /><circle cx="-6.5" cy="24" r="4.3" fill="#f5c542" />{activity === "resting" && <g className="wk-mug"><rect x="-14" y="16" width="10" height="11" rx="2" fill={C.paper} /><path d="M-14 19 q-4 0 -4 3 q0 3 4 3" stroke={C.paper} strokeWidth="1.6" fill="none" /></g>}</g></g>
      <g transform="translate(13 -62)"><g className="wk-arm wk-arm-r"><path d="M0 -1 l7 4 l3 18 l-7 1 l-4 -15 z" fill="#0e7490" /><circle cx="6.5" cy="24" r="4.3" fill="#f5c542" /><g transform="translate(-13 62)">{held}</g></g></g>
    </g>
    {activity === "waiting" && <g className="wk-bubble"><rect x="-4" y="-124" width="26" height="20" rx="6" fill={C.violet} /><path d="M2 -104 l-3 6 l8 -6 z" fill={C.violet} /><text x="9" y="-109.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">?</text></g>}
    {activity === "paused" && <g className="wk-bubble"><rect x="-4" y="-124" width="26" height="20" rx="6" fill={C.steel} /><path d="M2 -104 l-3 6 l8 -6 z" fill={C.steel} /><rect x="4" y="-119" width="3.4" height="10" rx="1" fill={C.paper} /><rect x="11" y="-119" width="3.4" height="10" rx="1" fill={C.paper} /></g>}
  </g>;
}

function heldItem(activity: FloorActivity, station: FloorStationId): ReactNode {
  if (activity !== "working") return activity === "celebrating" ? <Brick x={12} y={-48} w={16} color={C.amber} /> : null;
  if (station === "code") return <Brick x={14} y={-44} w={14} color={C.amber} />;
  if (station === "test") return <g><circle cx="29" cy="-52" r="6.5" stroke="#cbd5e1" strokeWidth="2.2" fill={C.cyan} fillOpacity="0.15" /><path d="M24.5 -47.5 L20 -40" stroke="#cbd5e1" strokeWidth="2.6" strokeLinecap="round" /></g>;
  if (station === "brief") return <rect x="15" y="-50" width="10" height="10" rx="1" fill={C.amber} />;
  if (station === "done") return <path d="M15 -36 h14" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />;
  return <path d="M18 -36 L30 -52" stroke={C.amber} strokeWidth="2.8" strokeLinecap="round" />;
}

function Station({ id, x, active, passed, activity }: { id: FloorStationId; x: number; active: boolean; passed: boolean; activity: FloorActivity }) {
  const working = active && (activity === "working" || activity === "celebrating");
  const cls = `wk-station ${active ? "wk-station--active" : ""} ${working ? "wk-station--working" : ""}`;
  const y = FLOOR_Y;
  let body: ReactNode;
  switch (id) {
    case "brief":
      body = <g>
        <rect x={x - 6} y={y - 92} width="64" height="50" rx="3" fill="#78350f" opacity="0.55" /><rect x={x - 2} y={y - 88} width="56" height="42" rx="2" fill="#a16207" opacity="0.35" />
        {[[0, 0, C.amber], [20, 4, C.cyan], [38, -2, C.violet], [8, 22, C.emerald], [30, 20, C.rose]].map(([dx, dy, color], index) => <rect key={index} className="wk-note" style={{ animationDelay: `${index * 0.5}s` }} x={x + Number(dx)} y={y - 84 + Number(dy)} width="14" height="12" rx="1" fill={String(color)} />)}
        <rect x={x + 18} y={y - 42} width="6" height="42" fill={C.steel} />
      </g>;
      break;
    case "code":
      body = <g>
        <rect x={x - 4} y={y - 6} width="70" height="6" rx="1.5" fill={C.bench} />
        {Array.from({ length: 9 }, (_, index) => <Brick key={index} className="wk-build" style={{ animationDelay: `${index * 0.32}s` }} x={x + (index % 3) * 21 + (Math.floor(index / 3) % 2 ? 6 : 0)} y={y - 16 - Math.floor(index / 3) * 10} w={20} color={[C.cyan, C.violet, C.emerald, C.amber][index % 4]} />)}
      </g>;
      break;
    case "test":
      body = <g>
        <rect x={x - 6} y={y - 30} width="76" height="5" rx="1.5" fill={C.steel} /><rect x={x} y={y - 25} width="4" height="25" fill={C.bench} /><rect x={x + 60} y={y - 25} width="4" height="25" fill={C.bench} />
        {[0, 1, 2].map((index) => <Brick key={index} x={x + index * 22} y={y - 40} w={18} color={[C.cyan, C.violet, C.amber][index]} />)}
        {[0, 1, 2].map((index) => <g key={index} className="wk-pass" style={{ animationDelay: `${index * 0.9}s` }}><circle cx={x + 9 + index * 22} cy={y - 56} r="6" fill={C.emerald} /><path d={`M${x + 6 + index * 22} ${y - 56} l2.3 2.3 l4 -4.6`} stroke="#0f172a" strokeWidth="1.8" fill="none" /></g>)}
      </g>;
      break;
    case "review":
      body = <g>
        <path d={`M${x + 4} ${y} L${x + 14} ${y - 50} H${x + 46} L${x + 56} ${y} Z`} fill={C.bench} />
        <rect x={x + 8} y={y - 84} width="44" height="40" rx="2" fill={C.paper} /><rect x={x + 22} y={y - 87} width="16" height="6" rx="2" fill={C.ink} />
        {[0, 1, 2].map((index) => <g key={index}><rect x={x + 13} y={y - 76 + index * 11} width="7" height="7" rx="1" fill="none" stroke={C.ink} /><path className="wk-tick" style={{ animationDelay: `${index * 0.7}s` }} d={`M${x + 14} ${y - 72.5 + index * 11} l2 2 l4 -4.5`} stroke="#059669" strokeWidth="1.8" fill="none" /><rect x={x + 24} y={y - 74 + index * 11} width="22" height="2.5" rx="1" fill="#94a3b8" /></g>)}
      </g>;
      break;
    case "docs":
      body = <g>
        <path d={`M${x} ${y - 70} h30 v44 h-30 z M${x + 30} ${y - 70} h30 v44 h-30 z`} fill={C.paper} /><rect x={x + 29} y={y - 70} width="2" height="44" fill="#94a3b8" />
        {[0, 1, 2, 3].map((index) => <rect key={index} className="wk-line" style={{ animationDelay: `${index * 0.5}s` }} x={x + 35} y={y - 63 + index * 9} width="20" height="2.5" rx="1" fill={C.ink} />)}
        {[0, 1, 2].map((index) => <Brick key={index} x={x + 5 + index * 7} y={y - 40 - index * 8} w={9} color={[C.cyan, C.violet, C.amber][index]} />)}
        <path d={`M${x + 22} ${y - 26} L${x + 14} ${y} M${x + 38} ${y - 26} L${x + 46} ${y}`} stroke={C.steel} strokeWidth="3" />
      </g>;
      break;
    case "done":
      body = <g>
        <rect x={x} y={y - 34} width="44" height="34" rx="2" fill="#a16207" /><rect x={x} y={y - 34} width="44" height="8" fill="#ca8a04" /><rect x={x + 18} y={y - 34} width="8" height="34" fill="#fde68a" opacity="0.6" />
        <rect x={x + 56} y={y - 78} width="3" height="78" fill={C.steel} /><path className="wk-flag" d={`M${x + 59} ${y - 78} h24 l-6 8 l6 8 h-24 z`} fill={C.emerald} />
        {active && activity === "celebrating" && [[-8, -90, C.amber], [30, -100, C.cyan], [70, -96, C.violet], [10, -66, C.rose], [88, -60, C.emerald]].map(([dx, dy, color], index) => <rect key={index} className="wk-confetti" style={{ animationDelay: `${index * 0.25}s` }} x={x + Number(dx)} y={y + Number(dy)} width="5" height="5" rx="1" fill={String(color)} />)}
      </g>;
      break;
  }
  return <g className={cls}>
    {active && <ellipse cx={x + 24} cy={y + 4} rx="70" ry="7" fill={activity === "waiting" ? C.violet : C.cyan} opacity="0.16" />}
    {body}
    {passed && <g><circle cx={x + 60} cy={y - 104} r="7" fill={C.emerald} /><path d={`M${x + 57} ${y - 104} l2.2 2.3 l4.2 -4.6`} stroke="#0f172a" strokeWidth="1.8" fill="none" /></g>}
  </g>;
}

export function WorkFloor({ workspace, waitingReviews = 0 }: { workspace?: string; waitingReviews?: number }) {
  const all = useActivityStream(workspace);
  const events = workspace ? all.filter((event) => event.workspace_name === workspace) : all;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const state = selectFloorState(events, now, { waitingReviews });
  const index = FLOOR_STATIONS.findIndex((station) => station.id === state.station);
  const station = FLOOR_STATIONS[index];
  const [walking, setWalking] = useState(false);
  const previous = useRef(state.station);
  useEffect(() => {
    if (previous.current === state.station) return;
    previous.current = state.station;
    setWalking(true);
    const timer = window.setTimeout(() => setWalking(false), 1600);
    return () => window.clearTimeout(timer);
  }, [state.station]);

  const headline = state.live
    ? `${state.workspace ? `${state.workspace} · ` : ""}${state.activity === "celebrating" ? "작업을 끝냈습니다" : station.working}`
    : state.activity === "waiting" ? `확인할 리뷰 ${waitingReviews}개가 검토대에서 기다립니다`
    : state.activity === "paused" ? `${station.label} 단계에서 멈춰 있습니다`
    : state.station === "done" ? "마지막 작업을 끝내고 쉬는 중입니다" : "새 요청을 기다리는 중입니다";

  return <div className="work-floor">
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${state.live ? "bg-cyan-300 ck-pulse-dot" : state.activity === "waiting" ? "bg-violet-300" : state.activity === "paused" ? "bg-amber-300" : "bg-slate-500"}`} />
        <span className="shrink-0 text-[13px] font-semibold text-white">{headline}</span>
        {state.message && <span className="min-w-0 truncate text-[12px] text-slate-400" title={state.message}>{state.message}</span>}
      </div>
      {state.at && <span className="shrink-0 font-mono text-[11px] text-slate-500">{relative(state.at, now)}</span>}
    </div>
    <svg viewBox="0 0 960 150" className="mt-2 block h-auto w-full" role="img" aria-label={`작업장 · ${headline}`}>
      <rect x="0" y={FLOOR_Y} width="960" height="10" rx="3" fill="#0f172a" />
      {Array.from({ length: 48 }, (_, dot) => <rect key={dot} x={6 + dot * 20} y={FLOOR_Y - 2} width="8" height="2.4" rx="0.8" fill="#1e293b" />)}
      {FLOOR_STATIONS.slice(0, -1).map((item, step) => <path key={item.id} d={`M${stationX(step) + 82} ${FLOOR_Y + 5} H${stationX(step + 1) - 30}`} stroke={state.passed.includes(item.id) ? C.emerald : "#334155"} strokeWidth="2" strokeDasharray="5 5" />)}
      {FLOOR_STATIONS.map((item, step) => <Station key={item.id} id={item.id} x={stationX(step)} active={item.id === state.station} passed={state.passed.includes(item.id)} activity={state.activity} />)}
      <g className="wk-mover" style={{ transform: `translate(${stationX(index) - 30}px, ${FLOOR_Y}px)` }}>
        <Worker activity={state.activity} station={state.station} walking={walking} held={heldItem(state.activity, state.station)} />
      </g>
    </svg>
    <div className="mt-1 grid grid-cols-6 gap-2">
      {FLOOR_STATIONS.map((item) => {
        const last = state.lastAt[item.id];
        const active = item.id === state.station;
        return <div key={item.id} title={last ? `${last.message} · ${relative(last.at, now)}` : "아직 기록 없음"} className={`rounded-lg px-2 py-1.5 text-center ${active ? "bg-cyan-300/[0.08] ring-1 ring-inset ring-cyan-300/25" : ""}`}>
          <div className={`text-[12px] font-semibold ${active ? "text-cyan-100" : state.passed.includes(item.id) ? "text-emerald-300" : "text-slate-400"}`}>{item.label}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{last ? relative(last.at, now) : "—"}</div>
        </div>;
      })}
    </div>
  </div>;
}
