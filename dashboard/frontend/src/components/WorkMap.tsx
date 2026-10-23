import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { useWorkspaces } from "../hooks/useWorkspaces.js";
import { placeEvents, selectFloorLanes, type FloorStationId } from "../lib/workFloor.js";
import { resolveTaskTitle } from "../lib/taskTitle.js";
import { selectWorldState, weekBins, type MainSpot, type Specialist } from "../lib/workWorld.js";
import { BlockPerson, Mug, type PersonRole } from "./BlockPerson.js";
import { relativeTime } from "./WorkFloor.js";

/* ── 아이소메트릭 좌표 ─────────────────────────────────────────── */
const TW = 60;
const TH = 30;
const OX = 520;
const OY = 64;
function iso(gx: number, gy: number, z = 0): [number, number] {
  return [OX + (gx - gy) * TW / 2, OY + (gx + gy) * TH / 2 - z];
}
const pts = (points: Array<[number, number]>) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function IsoBox({ x, y, w, d, h, color, z = 0, className }: { x: number; y: number; w: number; d: number; h: number; color: string; z?: number; className?: string }) {
  const top = pts([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]);
  const left = pts([iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]);
  const right = pts([iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)]);
  return <g className={className}>
    <polygon points={left} fill={color} /><polygon points={left} fill="#000" opacity="0.22" />
    <polygon points={right} fill={color} /><polygon points={right} fill="#000" opacity="0.4" />
    <polygon points={top} fill={color} />
  </g>;
}

/* ── 구역 ─────────────────────────────────────────────────────── */
type ZoneId = "spec" | "control" | "harness" | "confirm" | "code" | "test" | "review" | "docs" | "dock" | "weekly" | "domains";
interface Zone { id: ZoneId; x: number; y: number; w: number; d: number; tint: string; label: string; route: string | null }
const ZONES: Zone[] = [
  { id: "spec", x: 0, y: 0, w: 5, d: 5, tint: "#1d4ed8", label: "기획실 · SPEC", route: "/schedule" },
  { id: "control", x: 6, y: 0, w: 5, d: 5, tint: "#0e7490", label: "메인 관제실", route: "/sessions" },
  { id: "harness", x: 12, y: 0, w: 5, d: 5, tint: "#b45309", label: "Harness 지침실", route: "/harness" },
  { id: "confirm", x: 18, y: 0, w: 4, d: 5, tint: "#7c3aed", label: "사용자 확인", route: "/schedule" },
  { id: "code", x: 0, y: 7, w: 5, d: 5, tint: "#c2410c", label: "구현실", route: "/skills" },
  { id: "test", x: 6, y: 7, w: 5, d: 5, tint: "#0891b2", label: "테스트실", route: "/skills" },
  { id: "review", x: 12, y: 7, w: 5, d: 5, tint: "#6d28d9", label: "검토실", route: "/skills" },
  { id: "docs", x: 18, y: 7, w: 4, d: 5, tint: "#047857", label: "문서실", route: "/skills" },
  { id: "dock", x: 0, y: 13, w: 5, d: 3.4, tint: "#a16207", label: "커밋 출고장", route: "/sessions" },
  { id: "weekly", x: 6, y: 13, w: 5, d: 3.4, tint: "#be185d", label: "Weekly 창고", route: "/weekly" },
  { id: "domains", x: 12, y: 13, w: 10, d: 3.4, tint: "#334155", label: "도메인 현장", route: "/sessions" },
];
const ROOM_AGENT: Partial<Record<ZoneId, { role: PersonRole; agent: Specialist; station: FloorStationId }>> = {
  code: { role: "code", agent: "CODE", station: "code" },
  test: { role: "test", agent: "TEST", station: "test" },
  review: { role: "review", agent: "REVIEW", station: "review" },
  docs: { role: "docs", agent: "DOCS", station: "docs" },
};
const MAIN_AT: Record<MainSpot, [number, number]> = {
  spec: [3.4, 4.2], desk: [8.3, 3.6], code: [1.3, 11.3], test: [7.3, 11.3], review: [13.3, 11.3], docs: [19.2, 11.3], confirm: [19.6, 4.0], dock: [3.6, 15.6],
};
const WALL = 16;
const DAY = ["월", "화", "수", "목", "금", "토", "일"];
const PALETTE = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa"];

function Room({ zone, active, hovered }: { zone: Zone; active: boolean; hovered: boolean }) {
  const { x, y, w, d, tint } = zone;
  const floor = pts([iso(x, y), iso(x + w, y), iso(x + w, y + d), iso(x, y + d)]);
  const backRight = pts([iso(x, y), iso(x + w, y), iso(x + w, y, WALL), iso(x, y, WALL)]);
  const backLeft = pts([iso(x, y), iso(x, y + d), iso(x, y + d, WALL), iso(x, y, WALL)]);
  return <g>
    <polygon points={floor} fill={tint} opacity={hovered ? 0.42 : active ? 0.34 : 0.2} />
    <polygon points={floor} fill="none" stroke={tint} strokeOpacity={hovered || active ? 0.9 : 0.45} strokeWidth={hovered ? 2 : 1} />
    {zone.id !== "domains" && <><polygon points={backRight} fill="#1e293b" /><polygon points={backLeft} fill="#172033" /><polyline points={pts([iso(x, y + d, WALL), iso(x, y, WALL), iso(x + w, y, WALL)])} fill="none" stroke={tint} strokeOpacity="0.7" strokeWidth="2" /></>}
  </g>;
}

function Sign({ zone, hovered }: { zone: Zone; hovered: boolean }) {
  const [sx, sy] = iso(zone.x + (zone.id === "harness" ? zone.w * 0.85 : zone.w / 2), zone.y, WALL + (zone.id === "harness" ? 64 : 26));
  const width = zone.label.length * 11 + 22;
  return <g pointerEvents="none">
    <rect x={sx - width / 2} y={sy - 12} width={width} height="22" rx="11" fill="#0b1220" stroke={zone.tint} strokeOpacity={hovered ? 1 : 0.6} />
    <text x={sx} y={sy + 3.5} textAnchor="middle" className="wk-label wk-label--strong">{zone.label}</text>
  </g>;
}

function Person({ at, children, className, scale = 0.62 }: { at: [number, number]; children: ReactNode; className?: string; scale?: number }) {
  const [sx, sy] = iso(at[0], at[1]);
  return <g className={className} style={{ transform: `translate(${sx}px, ${sy}px) scale(${scale})` }}>{children}</g>;
}

interface Tip { zone: Zone; lines: string[] }

export function WorkMap({ specs, waitingReviews }: { specs: ScheduledSpec[]; waitingReviews: number }) {
  const navigate = useNavigate();
  const events = useActivityStream();
  const { data: workspaces } = useWorkspaces();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const plannedSpecs = specs.filter((spec) => !spec.has_run).length;
  const world = selectWorldState(events, now, { waitingReviews, plannedSpecs });
  const lanes = selectFloorLanes(events, now);
  const bins = useMemo(() => weekBins(specs, new Date(now)), [specs, now]);
  const lastAt = useMemo(() => {
    const result: Partial<Record<FloorStationId, number>> = {};
    for (const item of placeEvents(events)) result[item.station] ??= item.at;
    return result;
  }, [events]);
  const domains = (workspaces ?? []).slice(0, 6);
  const [hover, setHover] = useState<ZoneId | null>(null);

  const [walking, setWalking] = useState(false);
  const previous = useRef(world.mainSpot);
  useEffect(() => {
    if (previous.current === world.mainSpot) return;
    previous.current = world.mainSpot;
    setWalking(true);
    const timer = window.setTimeout(() => setWalking(false), 1600);
    return () => window.clearTimeout(timer);
  }, [world.mainSpot]);

  const leadTitle = lanes[0] && world.live ? resolveTaskTitle({ workspace: lanes[0].workspace, taskId: lanes[0].taskId, name: lanes[0].name }, specs) : null;
  const working = (agent: Specialist) => world.activeSpecialists.includes(agent);
  const taskAt = (station: FloorStationId) => lanes.find((lane) => lane.state.live && lane.state.station === station);
  const titleOf = (station: FloorStationId) => { const lane = taskAt(station); return lane ? resolveTaskTitle({ workspace: lane.workspace, taskId: lane.taskId, name: lane.name }, specs).title : null; };
  const weekTotal = bins.reduce((sum, count) => sum + count, 0);

  const headline = world.live
    ? world.mainActivity === "waiting" ? "사용자 확인을 기다리는 중"
      : world.activeSpecialist ? `${ZONES.find((zone) => ROOM_AGENT[zone.id]?.agent === world.activeSpecialist)!.label}에 작업을 맡겼습니다`
      : world.mainSpot === "dock" ? (world.mainActivity === "celebrating" ? "작업을 끝내고 출고했습니다" : "커밋할 결과를 포장하는 중") : "작업을 나눠 지시하는 중"
    : world.mainActivity === "waiting" ? `확인할 리뷰 ${waitingReviews}개가 창구에서 기다립니다`
    : world.mainSpot === "spec" ? `시작 전 SPEC ${plannedSpecs}개를 살펴보는 중` : "지금 진행 중인 작업은 없습니다";

  function tipFor(zone: Zone): Tip {
    const go = zone.route ? `누르면 ${({ "/schedule": "Schedule", "/sessions": "Workspaces", "/harness": "Harness", "/skills": "Skills", "/weekly": "Weekly" } as Record<string, string>)[zone.route]}로 이동` : "";
    const agent = ROOM_AGENT[zone.id];
    if (agent) {
      const title = titleOf(agent.station);
      const last = lastAt[agent.station];
      return { zone, lines: [working(agent.agent) ? `작업 중 · ${title ?? "진행 중인 작업"}` : "대기 중 · 메인의 작업 지시를 기다립니다", last ? `마지막 작업 ${relativeTime(last, now)}` : "아직 기록 없음", go] };
    }
    switch (zone.id) {
      case "spec": return { zone, lines: [`시작 전 SPEC ${plannedSpecs}개 · 전체 ${specs.length}개`, go] };
      case "control": return { zone, lines: [headline, leadTitle ? `${leadTitle.kind ? `${leadTitle.kind} · ` : ""}${leadTitle.title}` : "", go].filter(Boolean) };
      case "harness": return { zone, lines: ["프로젝트 규칙과 체크포인트를 모든 에이전트에게 전달합니다", go] };
      case "confirm": return { zone, lines: [waitingReviews > 0 ? `확인할 리뷰 ${waitingReviews}개` : "기다리는 확인 요청이 없습니다", go] };
      case "dock": return { zone, lines: [lastAt.commit ? `마지막 출고 ${relativeTime(lastAt.commit, now)}` : "출고 기록 없음", go] };
      case "weekly": return { zone, lines: [`이번 주 완료 ${weekTotal}건`, DAY.map((day, index) => `${day} ${bins[index]}`).join(" · "), go] };
      default: return { zone, lines: [domains.map((domain) => `${domain.name} 진행 ${domain.activeTaskCount} · 완료 ${domain.roadmap.done}`).join("\n"), go] };
    }
  }
  const tip = hover ? tipFor(ZONES.find((zone) => zone.id === hover)!) : null;
  const tipPos = tip ? iso(tip.zone.x + tip.zone.w, tip.zone.y + tip.zone.d / 2, 0) : null;
  const mainHeld = world.mainActivity === "working" && world.mainSpot !== "dock" ? <rect x="15" y="-50" width="11" height="13" rx="1" fill="#e2e8f0" /> : undefined;
  const mainPose = walking ? "wk--walking" : world.mainActivity === "working" ? "wk--working wk--at-order" : `wk--${world.mainActivity} wk--at-commit`;

  return <div className="work-world">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${world.live ? "bg-cyan-300 ck-pulse-dot" : world.mainActivity === "waiting" ? "bg-violet-300" : "bg-slate-500"}`} />
      <span className="shrink-0 text-[13px] font-semibold text-white">{headline}</span>
      {world.live && world.domain && <span className="shrink-0 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] px-1.5 py-0.5 text-[11px] text-cyan-100">{world.domain}</span>}
      {leadTitle && <span className="min-w-0 truncate text-[12px] text-slate-400">{leadTitle.kind ? `${leadTitle.kind} · ` : ""}{leadTitle.title}</span>}
      {world.live && world.at && <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500">{relativeTime(world.at, now)}</span>}
    </div>
    <div className="relative mt-2">
      <svg viewBox="0 0 1180 640" className="block h-auto w-full" role="img" aria-label={`작업장 지도 · ${headline}`}>
        <polygon points={pts([iso(-0.6, -0.6), iso(22.6, -0.6), iso(22.6, 16.9), iso(-0.6, 16.9)])} fill="#0b1220" stroke="#1e293b" />
        {ZONES.map((zone) => <Room key={zone.id} zone={zone} hovered={hover === zone.id} active={(ROOM_AGENT[zone.id] ? working(ROOM_AGENT[zone.id]!.agent) : false) || (zone.id === "confirm" && world.mainActivity === "waiting") || (zone.id === "spec" && plannedSpecs > 0)} />)}

        {(["control", "code", "test", "review", "docs"] as const).map((target) => {
          const zone = ZONES.find((item) => item.id === target)!;
          const [fx, fy] = iso(14.5, 2.5, 46);
          const [tx, ty] = iso(zone.x + zone.w / 2, zone.y + zone.d / 2, 34);
          return <path key={target} className="wk-guide" d={`M${fx} ${fy} Q${(fx + tx) / 2} ${Math.min(fy, ty) - 60} ${tx} ${ty}`} stroke="#f59e0b" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="5 7" fill="none" pointerEvents="none" />;
        })}

        {/* 기획실 */}
        <IsoBox x={0.8} y={1.4} w={3} d={1.8} h={12} color="#334155" />
        {Array.from({ length: Math.min(6, plannedSpecs || 1) }, (_, index) => <IsoBox key={index} x={1 + (index % 3) * 0.95} y={1.55 + Math.floor(index / 3) * 0.8} w={0.75} d={0.6} h={1.5} z={12} color={plannedSpecs ? "#e2e8f0" : "#64748b"} />)}
        <IsoBox x={0.3} y={0.1} w={3.6} d={0.15} h={34} z={4} color="#e2e8f0" />
        {/* 메인 관제실 */}
        <IsoBox x={7} y={1.2} w={3} d={1.2} h={11} color="#334155" />
        {[0, 1, 2].map((index) => <IsoBox key={index} x={7.2 + index * 0.95} y={1.25} w={0.75} d={0.15} h={16} z={11} color={world.live ? "#0e7490" : "#1e293b"} />)}
        {/* Harness 지침실 */}
        {[0, 1, 2].map((index) => <g key={index}><IsoBox x={12.4 + index * 1.5} y={0.3} w={1.2} d={0.6} h={44} color="#78350f" />{[0, 1, 2].map((shelf) => <IsoBox key={shelf} x={12.5 + index * 1.5} y={0.35} w={1} d={0.5} h={8} z={6 + shelf * 13} color={PALETTE[(index + shelf) % PALETTE.length]} />)}</g>)}
        <IsoBox x={14} y={2.6} w={1} d={1} h={14} color="#92400e" /><IsoBox x={13.9} y={2.5} w={1.2} d={1.2} h={2} z={14} color="#fde68a" />
        {/* 사용자 확인 창구 */}
        <IsoBox x={18.4} y={1.6} w={3} d={0.9} h={14} color="#4c1d95" />
        <IsoBox x={20.6} y={1.8} w={0.4} d={0.4} h={4} z={14} color="#fbbf24" className={waitingReviews > 0 || world.mainActivity === "waiting" ? "wk-bell" : undefined} />
        {/* 전문 인력 작업대 */}
        <IsoBox x={0.6} y={8} w={2.6} d={1.4} h={10} color="#334155" />
        {Array.from({ length: 6 }, (_, index) => <IsoBox key={index} x={0.8 + (index % 3) * 0.8} y={8.2 + Math.floor(index / 3) * 0.6} w={0.6} d={0.45} h={5} z={10} color={PALETTE[index % 4]} className={working("CODE") ? "wk-build" : undefined} />)}
        <IsoBox x={6.6} y={8} w={2.8} d={1.2} h={11} color="#334155" />
        {[0, 1, 2].map((index) => <IsoBox key={index} x={6.9 + index * 0.85} y={8.3} w={0.5} d={0.5} h={working("TEST") ? 8 : 3} z={11} color="#34d399" className={working("TEST") ? "wk-pass" : undefined} />)}
        <IsoBox x={12.6} y={8} w={2.6} d={1.2} h={11} color="#334155" />
        <IsoBox x={13.1} y={8.2} w={1.2} d={0.8} h={1.5} z={11} color="#e2e8f0" />
        <IsoBox x={18.4} y={7.3} w={2.8} d={0.5} h={40} color="#065f46" />
        {[0, 1].map((shelf) => <IsoBox key={shelf} x={18.5} y={7.35} w={2.6} d={0.4} h={8} z={8 + shelf * 16} color={shelf ? "#fbbf24" : "#e2e8f0"} />)}
        <IsoBox x={18.6} y={9} w={2} d={1.1} h={10} color="#334155" />
        {/* 커밋 출고장 */}
        <IsoBox x={0.5} y={13.6} w={4} d={0.8} h={6} color="#475569" />
        {[0, 1, 2].map((index) => <IsoBox key={index} x={0.8 + index * 1.2} y={13.7} w={0.8} d={0.6} h={8} z={6} color="#a16207" className={world.mainSpot === "dock" ? "wk-ship" : undefined} />)}
        {/* Weekly 창고 */}
        {bins.map((count, day) => <g key={day}>
          <IsoBox x={6.3 + day * 0.65} y={13.5} w={0.5} d={0.5} h={2} color="#1e293b" />
          {Array.from({ length: Math.min(count, 5) }, (_, level) => <IsoBox key={level} x={6.35 + day * 0.65} y={13.55} w={0.4} d={0.4} h={7} z={2 + level * 7} color={PALETTE[level % PALETTE.length]} />)}
        </g>)}
        {/* 도메인 현장 */}
        {domains.map((domain, index) => {
          const gx = 12.8 + index * (8.6 / Math.max(domains.length, 1));
          const floors = Math.min(6, Math.max(2, Math.ceil(domain.roadmap.total / 2)));
          const lit = domain.activeTaskCount > 0 || (world.live && world.domain === domain.name);
          const [lx, ly] = iso(gx + 1.6, 15.3, 0);
          return <g key={domain.name}>
            <IsoBox x={gx} y={13.6} w={1.4} d={1.4} h={floors * 9} color={PALETTE[index % PALETTE.length]} />
            <IsoBox x={gx + 0.2} y={13.8} w={1} d={1} h={2} z={floors * 9} color={lit ? "#fde047" : "#475569"} />
            <text x={lx + 8} y={ly + 16} textAnchor="middle" className="wk-label wk-label--strong" pointerEvents="none">{domain.name.length > 12 ? `${domain.name.slice(0, 11)}…` : domain.name}</text>
          </g>;
        })}

        {/* 전문 인력 */}
        {(Object.entries(ROOM_AGENT) as Array<[ZoneId, { role: PersonRole; agent: Specialist; station: FloorStationId }]>).map(([id, agent]) => {
          const zone = ZONES.find((item) => item.id === id)!;
          const busy = working(agent.agent);
          return <Person key={id} at={[zone.x + 3.6, zone.y + 2.2]}>
            {busy ? <BlockPerson role={agent.role} className={`wk--working wk--at-${agent.station}`} /> : <g opacity="0.75"><rect x="-14" y="-22" width="28" height="5" rx="2" fill="#334155" /><rect x="-2" y="-17" width="4" height="17" fill="#1e293b" /><BlockPerson role={agent.role} seated className="wk--seated" /></g>}
            {busy && <g className="wk-bubble"><circle cx="0" cy="-118" r="10" fill="#22d3ee" /><path d="M-4 -118 l3 3 l6 -6" stroke="#0f172a" strokeWidth="2.2" fill="none" /></g>}
          </Person>;
        })}

        {/* 메인 에이전트 */}
        <g className="wk-mover" style={{ transform: `translate(${iso(...MAIN_AT[world.mainSpot])[0]}px, ${iso(...MAIN_AT[world.mainSpot])[1]}px) scale(0.7)` }}>
          <BlockPerson role="main" className={mainPose} rightHand={walking ? undefined : mainHeld} leftHand={world.mainActivity === "resting" ? <Mug /> : undefined}
            extra={world.mainActivity === "waiting" ? <g className="wk-bubble"><rect x="-4" y="-124" width="26" height="20" rx="6" fill="#a78bfa" /><path d="M2 -104 l-3 6 l8 -6 z" fill="#a78bfa" /><text x="9" y="-109.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">?</text></g> : undefined} />
        </g>

        {ZONES.map((zone) => <Sign key={zone.id} zone={zone} hovered={hover === zone.id} />)}

        {/* 마우스·키보드 영역(맨 위) */}
        {ZONES.map((zone) => <polygon key={zone.id} points={pts([iso(zone.x, zone.y), iso(zone.x + zone.w, zone.y), iso(zone.x + zone.w, zone.y + zone.d), iso(zone.x, zone.y + zone.d)])}
          fill="transparent" className="wk-zone" role={zone.route ? "link" : undefined} tabIndex={zone.route ? 0 : undefined} aria-label={zone.label}
          onMouseEnter={() => setHover(zone.id)} onMouseLeave={() => setHover((current) => current === zone.id ? null : current)} onFocus={() => setHover(zone.id)} onBlur={() => setHover(null)}
          onClick={() => zone.route && navigate(zone.route)} onKeyDown={(event) => { if (zone.route && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); navigate(zone.route); } }} />)}
      </svg>
      {tip && tipPos && <div className="pointer-events-none absolute z-10 w-64 -translate-y-1/2 rounded-xl border border-white/[0.1] bg-[#0b1220]/95 px-3.5 py-2.5 shadow-2xl" style={{ left: `${Math.min(tipPos[0] / 1180 * 100, 72)}%`, top: `${tipPos[1] / 640 * 100}%` }}>
        <div className="text-[12px] font-semibold text-white">{tip.zone.label}</div>
        {tip.lines.filter(Boolean).map((line, index) => <div key={index} className={`mt-1 whitespace-pre-line text-[11px] leading-5 ${index === tip.lines.filter(Boolean).length - 1 && tip.zone.route ? "text-cyan-300" : "text-slate-300"}`}>{line}</div>)}
      </div>}
    </div>
  </div>;
}
