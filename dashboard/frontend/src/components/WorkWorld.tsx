import { Pin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { useWorkspaces } from "../hooks/useWorkspaces.js";
import { FLOOR_STATIONS, type FloorStationId } from "../lib/workFloor.js";
import { selectWorldState, taskTimelines, weekBins, type MainSpot, type Specialist } from "../lib/workWorld.js";
import { BlockPerson, Mug, type PersonRole } from "./BlockPerson.js";
import { Brick, C, StationProp, heldItem, relativeTime } from "./WorkFloor.js";

const FLOOR = 236;
const BOOTHS: ReadonlyArray<{ id: FloorStationId; label: string; role?: PersonRole; agent?: Specialist; tint: string }> = [
  { id: "code", label: "구현", role: "code", agent: "CODE", tint: "#f97316" },
  { id: "test", label: "테스트", role: "test", agent: "TEST", tint: "#22d3ee" },
  { id: "review", label: "검토", role: "review", agent: "REVIEW", tint: "#a78bfa" },
  { id: "confirm", label: "사용자 확인", tint: "#c4b5fd" },
  { id: "docs", label: "문서", role: "docs", agent: "DOCS", tint: "#34d399" },
];
const boothCenter = (index: number) => 440 + index * 140;
const SPOT_X: Record<MainSpot, number> = { spec: 168, desk: 246, code: boothCenter(0) - 74, test: boothCenter(1) - 74, review: boothCenter(2) - 74, confirm: boothCenter(3) + 46, docs: boothCenter(4) - 74, dock: 1096 };
const SPECIALIST_LABEL: Record<Specialist, string> = { CODE: "구현", TEST: "테스트", REVIEW: "검토", DOCS: "문서" };
const DOMAIN_COLORS = ["#0e7490", "#7c3aed", "#b45309", "#047857", "#be185d", "#1d4ed8"];
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const STATION_TONE: Record<FloorStationId, string> = { order: "text-slate-200 border-slate-500/40", code: "text-orange-200 border-orange-400/40", test: "text-cyan-200 border-cyan-400/40", review: "text-violet-200 border-violet-400/40", confirm: "text-violet-100 border-violet-300/50", docs: "text-emerald-200 border-emerald-400/40", commit: "text-amber-200 border-amber-400/40" };

function clock(at: number) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

export function WorkWorld({ specs, waitingReviews }: { specs: ScheduledSpec[]; waitingReviews: number }) {
  const events = useActivityStream();
  const { data: workspaces } = useWorkspaces();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const plannedSpecs = specs.filter((spec) => !spec.has_run).length;
  const world = selectWorldState(events, now, { waitingReviews, plannedSpecs });
  const bins = useMemo(() => weekBins(specs, new Date(now)), [specs, now]);
  const domains = (workspaces ?? []).slice(0, 6);
  const [picked, setPicked] = useState<string | null>(null);
  const selectedDomain = picked ?? world.domain ?? taskTimelines(events, undefined, now)[0]?.workspace ?? domains[0]?.name ?? null;
  const timelines = selectedDomain ? taskTimelines(events, selectedDomain, now).slice(0, 3) : [];

  const [walking, setWalking] = useState(false);
  const previous = useRef(world.mainSpot);
  useEffect(() => {
    if (previous.current === world.mainSpot) return;
    previous.current = world.mainSpot;
    setWalking(true);
    const timer = window.setTimeout(() => setWalking(false), 1600);
    return () => window.clearTimeout(timer);
  }, [world.mainSpot]);

  const headline = world.live
    ? world.mainActivity === "waiting" ? "사용자 확인을 기다리는 중"
      : world.activeSpecialist ? `${SPECIALIST_LABEL[world.activeSpecialist]} 인력에게 작업을 맡겼습니다`
      : world.mainSpot === "dock" ? (world.mainActivity === "celebrating" ? "작업을 끝내고 출고했습니다" : "커밋할 결과를 포장하는 중") : "작업을 나눠 지시하는 중"
    : world.mainActivity === "waiting" ? `확인할 리뷰 ${waitingReviews}개가 창구에서 기다립니다`
    : world.mainSpot === "spec" ? `시작 전 SPEC ${plannedSpecs}개를 살펴보는 중` : "지금 진행 중인 작업은 없습니다";
  const mainStation: FloorStationId = world.mainSpot === "dock" ? "commit" : "order";
  const mainPose = walking ? "wk--walking" : world.mainActivity === "working" && world.activeSpecialist ? "wk--working wk--at-order" : `wk--${world.mainActivity} wk--at-${mainStation}`;

  return <div className="work-world">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${world.live ? "bg-cyan-300 ck-pulse-dot" : world.mainActivity === "waiting" ? "bg-violet-300" : "bg-slate-500"}`} />
      <span className="shrink-0 text-[13px] font-semibold text-white">{headline}</span>
      {world.live && world.domain && <span className="shrink-0 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] px-1.5 py-0.5 text-[11px] text-cyan-100">{world.domain}</span>}
      {world.live && world.task && <span className="min-w-0 truncate text-[12px] text-slate-400" title={world.message}>{world.task}</span>}
      {world.live && world.at && <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500">{relativeTime(world.at, now)}</span>}
    </div>

    <svg viewBox="0 0 1320 372" className="mt-2 block h-auto w-full" role="img" aria-label={`작업 세계 · ${headline}`}>
      <rect x="6" y="66" width="1308" height={FLOOR - 60} rx="10" fill="#0b1324" stroke="#1e293b" />
      <rect x="6" y={FLOOR} width="1308" height="10" rx="3" fill="#0f172a" />
      {Array.from({ length: 64 }, (_, dot) => <rect key={dot} x={12 + dot * 20.4} y={FLOOR - 2} width="8" height="2.4" rx="0.8" fill="#1e293b" />)}

      <g>
        <rect x="18" y="92" width="128" height="88" rx="4" fill="#0f172a" stroke="#334155" />
        {Array.from({ length: Math.min(6, Math.max(plannedSpecs, 1)) }, (_, index) => <g key={index} opacity={plannedSpecs > 0 ? 1 : 0.3}><rect x={26 + (index % 3) * 39} y={100 + Math.floor(index / 3) * 38} width="32" height="30" rx="2" fill={C.paper} /><rect x={30 + (index % 3) * 39} y={106 + Math.floor(index / 3) * 38} width="18" height="2.4" fill={C.ink} /><rect x={30 + (index % 3) * 39} y={112 + Math.floor(index / 3) * 38} width="24" height="2" fill="#94a3b8" /></g>)}
        <rect x="78" y="180" width="6" height={FLOOR - 180} fill={C.steel} />
        <text x="82" y="86" textAnchor="middle" className="wk-label">기획실 · SPEC {plannedSpecs}</text>
      </g>
      <g>
        <rect x="200" y="186" width="96" height="8" rx="2" fill={C.steel} /><rect x="206" y="194" width="6" height={FLOOR - 194} fill={C.bench} /><rect x="284" y="194" width="6" height={FLOOR - 194} fill={C.bench} />
        <rect x="236" y="150" width="50" height="34" rx="3" fill="#0f172a" stroke="#334155" /><rect x="241" y="155" width="40" height="22" rx="1" fill={world.live ? "#0e7490" : "#1e293b"} /><rect x="258" y="184" width="6" height="4" fill={C.steel} />
        <text x="248" y="142" textAnchor="middle" className="wk-label">메인 데스크</text>
      </g>

      <g>
        <rect x="380" y="12" width="680" height="38" rx="6" fill="#111827" stroke="#f59e0b" strokeOpacity="0.45" />
        <text x="398" y="36" className="wk-label wk-label--strong">작업 지침 · Harness</text>
        {[0, 1, 2, 3, 4, 5].map((index) => <g key={index}><rect x={560 + index * 78} y="20" width="58" height="22" rx="3" fill="#fef3c7" opacity="0.9" /><rect x={566 + index * 78} y="26" width="34" height="2.4" fill="#92400e" /><rect x={566 + index * 78} y="32" width="44" height="2" fill="#b45309" opacity="0.7" /></g>)}
        {[SPOT_X.desk, ...BOOTHS.map((_, index) => boothCenter(index))].map((x, index) => <path key={index} className="wk-guide" d={`M${index === 0 ? 400 : x} 50 V${index === 0 ? 120 : 84}${index === 0 ? ` H${x}` : ""}`} stroke="#f59e0b" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="4 6" fill="none" />)}
      </g>

      {BOOTHS.map((booth, index) => {
        const cx = boothCenter(index);
        const active = (booth.agent !== undefined && world.activeSpecialists.includes(booth.agent)) || (booth.id === "confirm" && world.mainActivity === "waiting");
        return <g key={booth.id} className={`wk-booth ${active ? "wk-booth--active" : ""}`}>
          <rect x={cx - 64} y="84" width="128" height={FLOOR - 84} rx="6" fill={booth.tint} opacity={active ? 0.12 : 0.05} />
          <rect x={cx - 64} y="84" width="128" height="18" rx="6" fill={booth.tint} opacity={active ? 0.5 : 0.18} />
          <text x={cx} y="97" textAnchor="middle" className="wk-label wk-label--strong">{booth.label}</text>
          <circle cx={cx + 54} cy="93" r="3.2" fill={active ? booth.tint : "#334155"} className={active ? "ck-pulse-dot" : undefined} />
          <StationProp id={booth.id} x={booth.id === "confirm" ? cx - 52 : cx - 58} y={FLOOR} working={active && booth.id !== "confirm"} waiting={active && booth.id === "confirm"} />
          {booth.role && (active
            ? <g transform={`translate(${cx + 38} ${FLOOR})`}><BlockPerson role={booth.role} className={`wk--working wk--at-${booth.id}`} rightHand={heldItem("working", booth.id)} /></g>
            : <g transform={`translate(${cx + 34} ${FLOOR})`} opacity="0.7"><rect x="-14" y="-22" width="28" height="5" rx="2" fill={C.steel} /><rect x="-2" y="-17" width="4" height="17" fill={C.bench} /><BlockPerson role={booth.role} seated className="wk--seated" /></g>)}
        </g>;
      })}

      <g>
        <rect x="1060" y={FLOOR - 26} width="80" height="8" rx="4" fill={C.steel} />
        {[0, 1, 2, 3].map((index) => <circle key={index} cx={1068 + index * 21} cy={FLOOR - 22} r="3" fill="#0f172a" />)}
        <g className={world.mainSpot === "dock" ? "wk-ship" : undefined}><rect x="1082" y={FLOOR - 52} width="30" height="26" rx="2" fill="#a16207" /><rect x="1094" y={FLOOR - 52} width="6" height="26" fill="#fde68a" opacity="0.6" /></g>
        <text x="1100" y="142" textAnchor="middle" className="wk-label">커밋 출고</text>
      </g>
      <g>
        <rect x="1162" y="110" width="146" height={FLOOR - 110} rx="4" fill="#0f172a" stroke="#334155" />
        <text x="1235" y="102" textAnchor="middle" className="wk-label">Weekly · 이번 주 {bins.reduce((sum, count) => sum + count, 0)}건</text>
        {bins.map((count, day) => <g key={day}>
          {Array.from({ length: Math.min(count, 5) }, (_, level) => <rect key={level} x={1170 + day * 19.5} y={FLOOR - 40 - level * 17} width="15" height="14" rx="2" fill={[C.cyan, C.violet, C.emerald, C.amber, C.rose][level]} opacity="0.85" />)}
          {count > 5 && <text x={1177.5 + day * 19.5} y={FLOOR - 128} textAnchor="middle" className="wk-label">+{count - 5}</text>}
          <text x={1177.5 + day * 19.5} y={FLOOR - 4} textAnchor="middle" className={`wk-label ${day === (new Date(now).getDay() + 6) % 7 ? "wk-label--strong" : ""}`}>{DAY_LABELS[day]}</text>
        </g>)}
      </g>

      <g className="wk-mover" style={{ transform: `translate(${SPOT_X[world.mainSpot]}px, ${FLOOR}px)` }}>
        <BlockPerson role="main" className={mainPose} rightHand={walking ? undefined : world.mainSpot === "dock" ? heldItem(world.mainActivity, "commit") : world.mainActivity === "working" ? heldItem("working", "order") : undefined} leftHand={world.mainActivity === "resting" ? <Mug /> : undefined}
          extra={world.mainActivity === "waiting" ? <g className="wk-bubble"><rect x="-4" y="-124" width="26" height="20" rx="6" fill={C.violet} /><path d="M2 -104 l-3 6 l8 -6 z" fill={C.violet} /><text x="9" y="-109.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">?</text></g> : undefined} />
      </g>

      <path d={`M1100 ${FLOOR + 10} V258 H60`} stroke="#334155" strokeWidth="2" strokeDasharray="6 6" fill="none" />
      <rect x="6" y="334" width="1308" height="8" rx="3" fill="#0f172a" />
      {domains.map((domain, index) => {
        const cx = 110 + index * ((1320 - 220) / Math.max(domains.length - 1, 1));
        const floors = Math.min(5, Math.max(2, Math.ceil(domain.roadmap.total / 2)));
        const liveHere = world.live && world.domain === domain.name;
        const lit = Math.min(floors * 3, domain.activeTaskCount + (liveHere ? 1 : 0));
        const selected = domain.name === selectedDomain;
        const color = DOMAIN_COLORS[index % DOMAIN_COLORS.length];
        return <g key={domain.name} className="wk-domain" role="button" tabIndex={0} aria-pressed={selected} aria-label={`${domain.name} 작업 흐름 보기`} onClick={() => setPicked(domain.name)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPicked(domain.name); } }}>
          <rect x={cx - 80} y="262" width="160" height="108" fill="transparent" />
          {selected && <ellipse cx={cx} cy="336" rx="74" ry="8" fill={color} opacity="0.22" />}
          {Array.from({ length: floors }, (_, level) => <g key={level}>
            <Brick x={cx - 42} y={324 - level * 12} w={84} color={level % 2 ? color : "#475569"} />
            {[0, 1, 2].map((slot) => <rect key={slot} x={cx - 32 + slot * 24} y={326 - level * 12} width="14" height="4.5" rx="1" fill={level * 3 + slot < lit ? C.amber : "#0f172a"} opacity={level * 3 + slot < lit ? 0.95 : 0.55} />)}
          </g>)}
          <rect x={cx + 44} y={316 - floors * 12} width="2.5" height={floors * 12 + 18} fill={C.steel} />
          <path d={`M${cx + 46.5} ${316 - floors * 12} h16 l-4 5 l4 5 h-16 z`} fill={domain.roadmap.done > 0 ? C.emerald : "#334155"} />
          {(selected || liveHere) && <g className="wk-bubble"><path d={`M${cx} ${306 - floors * 12} c-8 -10 -8 -22 0 -22 c8 0 8 12 0 22 z`} fill={liveHere ? C.cyan : "#94a3b8"} /><circle cx={cx} cy={290 - floors * 12} r="3" fill="#0f172a" /></g>}
          <text x={cx} y="355" textAnchor="middle" className={`wk-label ${selected ? "wk-label--strong" : ""}`}>{domain.name.length > 18 ? `${domain.name.slice(0, 17)}…` : domain.name}</text>
          <text x={cx} y="368" textAnchor="middle" className="wk-label wk-label--dim">진행 {domain.activeTaskCount} · 완료 {domain.roadmap.done}</text>
        </g>;
      })}
    </svg>

    {selectedDomain && <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-4 py-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-200"><span className="text-cyan-200">{selectedDomain}</span><span className="text-slate-500">작업 흐름 기록</span></div>
      {timelines.length === 0 ? <p className="mt-2 text-[12px] text-slate-500">이 도메인의 작업 이벤트가 아직 없습니다.</p> : <div className="mt-2 space-y-2">
        {timelines.map((timeline) => <div key={timeline.key} className="flex min-w-0 items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${timeline.live ? "bg-cyan-300/[0.12] text-cyan-200" : "bg-white/[0.04] text-slate-400"}`}><Pin size={13} /></span>
          <strong className="w-44 shrink-0 truncate text-[12px] text-white" title={timeline.name}>{timeline.name}</strong>
          <div className="ck-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5">
            {timeline.steps.map((step, index) => <span key={`${step.at}-${index}`} className="flex shrink-0 items-center gap-1">
              {index > 0 && <span className="text-[10px] text-slate-600">→</span>}
              <span title={`${step.message} · ${clock(step.at)}`} className={`rounded-md border bg-white/[0.02] px-1.5 py-0.5 text-[11px] ${STATION_TONE[step.station]}`}>{FLOOR_STATIONS.find((item) => item.id === step.station)!.label}<span className="ml-1 font-mono text-[10px] text-slate-500">{clock(step.at)}</span></span>
            </span>)}
          </div>
        </div>)}
      </div>}
    </div>}
  </div>;
}
