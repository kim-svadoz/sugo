import { CameraControls, Html, OrthographicCamera, QuadraticBezierLine, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import type { ScheduledSpec } from "../../api/roadmapMutationsApi.js";
import { useActivityStream } from "../../hooks/useActivityStream.js";
import { useWorkspaces } from "../../hooks/useWorkspaces.js";
import { placeEvents, selectFloorLanes, type FloorStationId } from "../../lib/workFloor.js";
import { DESK_X, DESK_Z, SPECIALISTS, placeAgents } from "../../lib/workRoom.js";
import { resolveTaskTitle } from "../../lib/taskTitle.js";
import { selectWorldState, weekBins, type Specialist } from "../../lib/workWorld.js";
import { relativeTime } from "../WorkFloor.js";
import { Minifig, type FigureRole } from "./Minifig.js";

type ZoneId = "spec" | "control" | "harness" | "confirm" | "work" | "lounge" | "dock" | "weekly" | "domains";
interface Zone { id: ZoneId; label: string; center: [number, number]; size: [number, number]; tint: string; route: string; page: string }
const ZONES: Zone[] = [
  { id: "spec", label: "기획실 · SPEC", center: [-9, -5.8], size: [7, 5.4], tint: "#2563eb", route: "/schedule", page: "Schedule" },
  { id: "control", label: "메인 데스크", center: [-1, -6.2], size: [6, 4.6], tint: "#0891b2", route: "/sessions", page: "Workspaces" },
  { id: "harness", label: "Harness 지침", center: [7, -6.6], size: [8, 3.8], tint: "#d97706", route: "/harness", page: "Harness" },
  { id: "work", label: "전문 인력 작업실", center: [-2, 0.4], size: [16, 4.2], tint: "#0e7490", route: "/skills", page: "Skills" },
  { id: "confirm", label: "사용자 확인", center: [10.6, 0.6], size: [4.4, 6], tint: "#7c3aed", route: "/schedule", page: "Schedule" },
  { id: "lounge", label: "대기 라운지", center: [-10, 6.2], size: [6, 4.6], tint: "#64748b", route: "/skills", page: "Skills" },
  { id: "dock", label: "커밋 출고", center: [-1.4, 6.8], size: [6.4, 3.4], tint: "#ca8a04", route: "/sessions", page: "Workspaces" },
  { id: "weekly", label: "Weekly", center: [5, 6.8], size: [4.4, 3.4], tint: "#db2777", route: "/weekly", page: "Weekly" },
  { id: "domains", label: "도메인 현장", center: [10.6, 6.8], size: [4.4, 3.4], tint: "#16a34a", route: "/sessions", page: "Workspaces" },
];
const ROLE: Record<Specialist, FigureRole> = { CODE: "code", TEST: "test", REVIEW: "review", DOCS: "docs" };
const STATION: Record<Specialist, FloorStationId> = { CODE: "code", TEST: "test", REVIEW: "review", DOCS: "docs" };
const AGENT_LABEL: Record<Specialist, string> = { CODE: "구현", TEST: "테스트", REVIEW: "검토", DOCS: "문서" };
const POSTIT = ["#fde047", "#f9a8d4", "#86efac", "#7dd3fc", "#fdba74", "#c4b5fd"];
const DAY = ["월", "화", "수", "목", "금", "토", "일"];

function M({ color, emissive, intensity = 0.8, opacity }: { color: string; emissive?: string; intensity?: number; opacity?: number }) {
  return <meshStandardMaterial color={color} roughness={0.55} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? intensity : 0} transparent={opacity !== undefined} opacity={opacity ?? 1} />;
}
function Box({ p, s, c, e, cast = true }: { p: [number, number, number]; s: [number, number, number]; c: string; e?: string; cast?: boolean }) {
  return <mesh position={p} castShadow={cast} receiveShadow><boxGeometry args={s} /><M color={c} emissive={e} /></mesh>;
}

function Desk({ x, z, w = 2.6, d = 1.1 }: { x: number; z: number; w?: number; d?: number }) {
  return <group position={[x, 0, z]}>
    <RoundedBox args={[w, 0.08, d]} radius={0.03} position={[0, 0.78, 0]} castShadow receiveShadow><M color="#cbd5e1" /></RoundedBox>
    {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => <Box key={`${sx}${sz}`} p={[sx * (w / 2 - 0.08), 0.39, sz * (d / 2 - 0.08)]} s={[0.06, 0.78, 0.06]} c="#64748b" />)}
  </group>;
}
function Monitor({ x, z, on, y = 0.82 }: { x: number; z: number; on: boolean; y?: number }) {
  return <group position={[x, y, z]}>
    <Box p={[0, 0.03, 0]} s={[0.24, 0.04, 0.18]} c="#334155" />
    <Box p={[0, 0.22, 0]} s={[0.05, 0.36, 0.05]} c="#334155" />
    <Box p={[0, 0.48, 0]} s={[0.78, 0.48, 0.05]} c="#0f172a" />
    <mesh position={[0, 0.48, 0.03]}><planeGeometry args={[0.7, 0.4]} /><M color={on ? "#0e7490" : "#1e293b"} emissive={on ? "#22d3ee" : undefined} intensity={0.6} /></mesh>
  </group>;
}
function Chair({ x, z, facing = Math.PI }: { x: number; z: number; facing?: number }) {
  return <group position={[x, 0, z]} rotation={[0, facing, 0]}>
    <Box p={[0, 0.44, 0]} s={[0.56, 0.08, 0.56]} c="#1e293b" />
    <Box p={[0, 0.78, -0.26]} s={[0.56, 0.62, 0.07]} c="#1e293b" />
    <Box p={[0, 0.22, 0]} s={[0.08, 0.44, 0.08]} c="#475569" />
  </group>;
}
function PostIts({ x, y, z, cols, rows, count, gap = 0.42 }: { x: number; y: number; z: number; cols: number; rows: number; count: number; gap?: number }) {
  return <group>{Array.from({ length: Math.min(count, cols * rows) }, (_, index) => <mesh key={index} position={[x + (index % cols) * gap, y - Math.floor(index / cols) * gap, z]} rotation={[0, 0, ((index * 37) % 9 - 4) * 0.025]}><planeGeometry args={[0.32, 0.32]} /><M color={POSTIT[index % POSTIT.length]} /></mesh>)}</group>;
}
function Plant({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.22, 0.17, 0.5, 16]} /><M color="#92400e" /></mesh>
    {[[0, 0.75, 0, 0.36], [0.16, 0.95, 0.06, 0.26], [-0.14, 0.9, -0.08, 0.28]].map(([px, py, pz, r], index) => <mesh key={index} position={[px, py, pz]} castShadow><sphereGeometry args={[r, 14, 10]} /><M color="#15803d" /></mesh>)}
  </group>;
}

/** Harness 벽에서 각 책상으로 흐르는 지침 빛줄기. */
function GuideBeam({ to }: { to: [number, number, number] }) {
  const ref = useRef<{ material: { dashOffset: number } } | null>(null);
  useFrame((_, delta) => { if (ref.current) ref.current.material.dashOffset -= delta * 0.9; });
  return <QuadraticBezierLine ref={ref as never} start={[7, 2.1, -8.7]} end={to} mid={[(7 + to[0]) / 2, 4.2, (-8.7 + to[2]) / 2]} color="#f59e0b" lineWidth={1.6} dashed dashSize={0.25} gapSize={0.22} transparent opacity={0.75} />;
}

function Pulse({ children, active }: { children: ReactNode; active: boolean }) {
  const ref = useRef<Group>(null);
  useFrame((state) => { if (ref.current) ref.current.position.y = active ? Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 0.06 : 0; });
  return <group ref={ref}>{children}</group>;
}
function Conveyor({ shipping }: { shipping: boolean }) {
  const boxes = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!boxes.current || !shipping) return;
    for (const child of boxes.current.children) { child.position.x += delta * 0.8; if (child.position.x > 2.2) child.position.x = -2.2; }
  });
  return <group position={[-1.4, 0, 6.9]}>
    <Box p={[0, 0.42, 0]} s={[5, 0.12, 1]} c="#334155" />
    {[-2.2, -1.1, 0, 1.1, 2.2].map((x) => <mesh key={x} position={[x, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.07, 1.02, 10]} /><M color="#64748b" /></mesh>)}
    {[-2.3, 2.3].map((x) => <Box key={x} p={[x, 0.2, 0]} s={[0.1, 0.4, 0.9]} c="#1e293b" />)}
    <group ref={boxes}>{[-1.6, 0, 1.6].map((x) => <group key={x} position={[x, 0.68, 0]}><Box p={[0, 0, 0]} s={[0.6, 0.42, 0.6]} c="#a16207" /><Box p={[0, 0.215, 0]} s={[0.14, 0.01, 0.6]} c="#fde68a" cast={false} /></group>)}</group>
    <Box p={[2.9, 1.2, 0]} s={[0.14, 2.4, 1.4]} c="#475569" />
  </group>;
}

function Bell({ ringing }: { ringing: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => { if (ref.current) { ref.current.rotation.z = ringing ? Math.sin(state.clock.elapsedTime * 14) * 0.3 : 0; (ref.current.material as MeshStandardMaterial).emissiveIntensity = ringing ? 0.6 + Math.sin(state.clock.elapsedTime * 6) * 0.4 : 0.1; } });
  return <mesh ref={ref} position={[10.2, 1.18, 0.4]} castShadow><sphereGeometry args={[0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.1} metalness={0.6} roughness={0.3} /></mesh>;
}

function Scene({ data, hover, setHover, onSelect, controls }: { data: SceneData; hover: ZoneId | null; setHover: (zone: ZoneId | null) => void; onSelect: (zone: ZoneId) => void; controls: React.RefObject<CameraControls | null> }) {
  const { placement, world, plannedSpecs, bins, domains, waitingReviews, working } = data;
  return <>
    <OrthographicCamera makeDefault position={[22, 21, 22]} zoom={26} near={0.1} far={200} />
    <CameraControls ref={controls} makeDefault minPolarAngle={0.65} maxPolarAngle={1.05} minAzimuthAngle={0.35} maxAzimuthAngle={1.2} minZoom={18} maxZoom={90} dollyToCursor />
    <ambientLight intensity={0.55} />
    <hemisphereLight args={["#cbd5e1", "#0f172a", 0.6]} />
    <directionalLight position={[12, 22, 10]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={14} shadow-camera-bottom={-14} />

    {/* 바닥과 벽 */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow><planeGeometry args={[27, 19]} /><M color="#1c2433" /></mesh>
    {Array.from({ length: 14 }, (_, index) => <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[-13.5 + index * 2, 0.002, 0]}><planeGeometry args={[0.02, 19]} /><M color="#273246" /></mesh>)}
    <Box p={[0, 1.5, -9.6]} s={[27.4, 3, 0.25]} c="#2b3647" />
    <Box p={[-13.6, 1.5, 0]} s={[0.25, 3, 19.4]} c="#253042" />
    {[-11, -7.5, 9.5].map((x) => <mesh key={x} position={[x, 2.1, -9.46]}><planeGeometry args={[2.2, 1]} /><M color="#1e3a5f" emissive="#38bdf8" intensity={0.25} /></mesh>)}

    {/* 구역 바닥 표시 */}
    {ZONES.map((zone) => <mesh key={zone.id} rotation={[-Math.PI / 2, 0, 0]} position={[zone.center[0], 0.012, zone.center[1]]}>
      <planeGeometry args={zone.size} /><M color={zone.tint} opacity={hover === zone.id ? 0.38 : 0.14} emissive={hover === zone.id ? zone.tint : undefined} intensity={0.35} />
    </mesh>)}

    {/* 기획실: 화이트보드와 SPEC 포스트잇, 회의 테이블 */}
    <Box p={[-9, 1.75, -9.4]} s={[4.6, 2, 0.08]} c="#f8fafc" />
    <PostIts x={-10.9} y={2.45} z={-9.34} cols={6} rows={3} count={Math.max(plannedSpecs, 1)} gap={0.62} />
    <RoundedBox args={[4, 0.1, 1.6]} radius={0.04} position={[-9, 0.76, -5.6]} castShadow receiveShadow><M color="#e2e8f0" /></RoundedBox>
    {[[-10.6, -5.6], [-7.4, -5.6]].map(([x, z]) => <Box key={x} p={[x, 0.38, z]} s={[0.1, 0.76, 1.2]} c="#64748b" />)}
    {Array.from({ length: Math.min(plannedSpecs, 4) }, (_, index) => <Box key={index} p={[-10.2 + index * 0.8, 0.83, -5.5]} s={[0.5, 0.02, 0.66]} c="#f8fafc" cast={false} />)}

    {/* 메인 데스크 */}
    <Desk x={-1} z={-7} w={3.6} d={1.2} />
    {[-2.1, -1, 0.1].map((x) => <Monitor key={x} x={x} z={-7.3} on={world.live} />)}
    <Chair x={-1} z={-5.9} />

    {/* Harness 벽: 코르크보드 지침 포스트잇과 지침서 책장 */}
    <Box p={[6, 1.85, -9.42]} s={[5, 2.1, 0.1]} c="#a16207" />
    <PostIts x={4.0} y={2.6} z={-9.35} cols={9} rows={4} count={30} gap={0.48} />
    {[9.6, 10.9].map((x) => <group key={x}><Box p={[x, 1.1, -9.1]} s={[1.2, 2.2, 0.5]} c="#78350f" />{[0.45, 1.1, 1.75].map((y, row) => Array.from({ length: 5 }, (_, book) => <Box key={`${row}-${book}`} p={[x - 0.42 + book * 0.21, y, -9]} s={[0.16, 0.5, 0.36]} c={POSTIT[(book + row + Math.round(x)) % POSTIT.length]} cast={false} />))}</group>)}
    {[...SPECIALISTS.map((agent) => [DESK_X[agent], 1.5, DESK_Z - 0.3] as [number, number, number]), [-1, 1.6, -7.2] as [number, number, number]].map((to, index) => <GuideBeam key={index} to={to} />)}

    {/* 전문 인력 책상 */}
    {SPECIALISTS.map((agent) => {
      const x = DESK_X[agent];
      const on = working.includes(agent);
      return <group key={agent}>
        <Desk x={x} z={DESK_Z} />
        <Monitor x={x} z={DESK_Z - 0.25} on={on} />
        <Chair x={x} z={DESK_Z + 1.1} />
        {agent === "CODE" && Array.from({ length: 6 }, (_, index) => <Pulse key={index} active={on}><Box p={[x + 0.7 + (index % 3) * 0.2, 0.9 + Math.floor(index / 3) * 0.14, DESK_Z + 0.15]} s={[0.18, 0.12, 0.14]} c={POSTIT[index]} /></Pulse>)}
        {agent === "TEST" && [0, 1, 2].map((index) => <mesh key={index} position={[x + 0.6 + index * 0.22, 0.9, DESK_Z + 0.2]}><sphereGeometry args={[0.07, 12, 8]} /><M color={on ? "#34d399" : "#334155"} emissive={on ? "#34d399" : undefined} /></mesh>)}
        {agent === "REVIEW" && <Box p={[x + 0.75, 0.84, DESK_Z + 0.15]} s={[0.46, 0.03, 0.6]} c="#f8fafc" cast={false} />}
        {agent === "DOCS" && [0, 1, 2].map((index) => <Box key={index} p={[x + 0.8, 0.86 + index * 0.1, DESK_Z + 0.1]} s={[0.5, 0.09, 0.66]} c={POSTIT[index + 2]} />)}
        <Html position={[x, 2.15, DESK_Z - 0.3]} center className="pointer-events-none select-none"><div className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${on ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-50" : "border-white/10 bg-slate-900/70 text-slate-400"}`}>{AGENT_LABEL[agent]}{on ? " · 작업 중" : ""}</div></Html>
      </group>;
    })}

    {/* 대기 라운지 */}
    <RoundedBox args={[1.1, 0.5, 4.4]} radius={0.12} position={[-12.6, 0.25, 6.1]} castShadow receiveShadow><M color="#475569" /></RoundedBox>
    <RoundedBox args={[0.3, 0.9, 4.4]} radius={0.1} position={[-13.15, 0.7, 6.1]} castShadow><M color="#475569" /></RoundedBox>
    <RoundedBox args={[1.2, 0.36, 1.6]} radius={0.06} position={[-10.2, 0.18, 6.1]} castShadow receiveShadow><M color="#78350f" /></RoundedBox>
    {[5.7, 6.4].map((z) => <mesh key={z} position={[-10.1, 0.43, z]}><cylinderGeometry args={[0.07, 0.06, 0.14, 12]} /><M color="#f8fafc" /></mesh>)}
    <Plant x={-12.8} z={8.8} />
    <Plant x={13} z={-8.6} />

    {/* 사용자 확인 카운터 */}
    <RoundedBox args={[1, 1.05, 4]} radius={0.06} position={[10.6, 0.52, 0.6]} castShadow receiveShadow><M color="#4c1d95" /></RoundedBox>
    <Box p={[10.6, 1.09, 0.6]} s={[1.2, 0.06, 4.2]} c="#c4b5fd" />
    <Bell ringing={waitingReviews > 0 || world.mainActivity === "waiting"} />
    <Chair x={12} z={0.6} facing={-Math.PI / 2} />

    {/* 커밋 출고 · Weekly 선반 · 도메인 모형 */}
    <Conveyor shipping={world.mainSpot === "dock"} />
    <Box p={[5, 1.1, 6.2]} s={[4, 2.2, 0.4]} c="#3f3f46" />{[0.02, 0.48, 0.94, 1.4].map((y) => <Box key={y} p={[5, y + 0.06, 6.75]} s={[4, 0.06, 0.9]} c="#52525b" />)}
    {bins.map((count, day) => Array.from({ length: Math.min(count, 4) }, (_, level) => <Box key={`${day}-${level}`} p={[3.3 + day * 0.56, 0.3 + level * 0.46, 6.8]} s={[0.42, 0.4, 0.42]} c={POSTIT[(day + level) % POSTIT.length]} />))}
    <RoundedBox args={[3.8, 0.12, 2.4]} radius={0.04} position={[10.6, 0.74, 6.8]} castShadow receiveShadow><M color="#e2e8f0" /></RoundedBox>
    {[[9, 6], [12.2, 6], [9, 7.6], [12.2, 7.6]].map(([x, z]) => <Box key={`${x}${z}`} p={[x, 0.37, z]} s={[0.08, 0.74, 0.08]} c="#64748b" />)}
    {domains.map((domain, index) => {
      const h = 0.3 + Math.min(1.2, domain.roadmap.total * 0.12);
      return <group key={domain.name} position={[9.3 + (index % 3) * 1.25, 0.8, 6.3 + Math.floor(index / 3) * 1]}>
        <Box p={[0, h / 2, 0]} s={[0.7, h, 0.6]} c={["#0e7490", "#7c3aed", "#b45309", "#047857", "#be185d", "#1d4ed8"][index % 6]} />
        <Box p={[0, h + 0.03, 0]} s={[0.5, 0.06, 0.4]} c={domain.activeTaskCount > 0 ? "#fde047" : "#475569"} e={domain.activeTaskCount > 0 ? "#fde047" : undefined} />
      </group>;
    })}

    {/* 사람 */}
    {SPECIALISTS.map((agent) => <Minifig key={agent} role={ROLE[agent]} position={placement.specialists[agent].position} facing={placement.specialists[agent].facing} pose={placement.specialists[agent].pose} held={placement.specialists[agent].at === "lounge" && agent === "DOCS" ? "mug" : undefined} />)}
    <Minifig role="main" position={placement.main.position} facing={placement.main.facing} pose={placement.main.pose} held={placement.main.pose === "stand" ? "card" : placement.main.pose === "sip" ? "mug" : placement.main.pose === "celebrate" ? "brick" : undefined} />
    {world.mainActivity === "waiting" && <Html position={[placement.main.position[0], 2.6, placement.main.position[1]]} center className="pointer-events-none"><div className="rounded-full bg-violet-400 px-2 py-0.5 text-[12px] font-bold text-slate-900 shadow-lg">?</div></Html>}

    {/* 구역 이름과 마우스 영역 */}
    {ZONES.map((zone) => <Html key={zone.id} position={[zone.center[0] - zone.size[0] / 2 + 0.4, 0.05, zone.center[1] - zone.size[1] / 2 + 0.4]} className="pointer-events-none select-none"><div className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${hover === zone.id ? "bg-white text-slate-900" : "bg-slate-950/60 text-slate-300"}`}>{zone.label}</div></Html>)}
    {ZONES.map((zone) => <mesh key={zone.id} rotation={[-Math.PI / 2, 0, 0]} position={[zone.center[0], 0.02, zone.center[1]]}
      onPointerOver={(event) => { event.stopPropagation(); setHover(zone.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}
      onClick={(event) => { event.stopPropagation(); onSelect(zone.id); }}>
      <planeGeometry args={zone.size} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>)}
  </>;
}

interface SceneData {
  placement: ReturnType<typeof placeAgents>;
  world: ReturnType<typeof selectWorldState>;
  plannedSpecs: number;
  bins: number[];
  domains: Array<{ name: string; activeTaskCount: number; roadmap: { total: number; done: number } }>;
  waitingReviews: number;
  working: Specialist[];
}

export default function WorkRoom({ specs, waitingReviews }: { specs: ScheduledSpec[]; waitingReviews: number }) {
  const navigate = useNavigate();
  const events = useActivityStream();
  const { data: workspaces } = useWorkspaces();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const plannedSpecs = specs.filter((spec) => !spec.has_run).length;
  const world = selectWorldState(events, now, { waitingReviews, plannedSpecs });
  const placement = placeAgents(world);
  const lanes = selectFloorLanes(events, now);
  const bins = useMemo(() => weekBins(specs, new Date(now)), [specs, now]);
  const lastAt = useMemo(() => { const result: Partial<Record<FloorStationId, number>> = {}; for (const item of placeEvents(events)) result[item.station] ??= item.at; return result; }, [events]);
  const domains = (workspaces ?? []).slice(0, 6);
  const [hover, setHover] = useState<ZoneId | null>(null);
  const [focus, setFocus] = useState<ZoneId | null>(null);
  const controls = useRef<CameraControls | null>(null);
  const titleOf = (station: FloorStationId) => { const lane = lanes.find((item) => item.state.live && item.state.station === station); return lane ? resolveTaskTitle({ workspace: lane.workspace, taskId: lane.taskId, name: lane.name }, specs) : null; };
  const lead = lanes[0] && world.live ? resolveTaskTitle({ workspace: lanes[0].workspace, taskId: lanes[0].taskId, name: lanes[0].name }, specs) : null;

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    if (!focus) { void control.setLookAt(22, 21, 22, 0, 0, 0.5, true); void control.zoomTo(26, true); return; }
    const zone = ZONES.find((item) => item.id === focus)!;
    const [cx, cz] = zone.center;
    void control.setLookAt(cx + 22, 21, cz + 22, cx, 0.6, cz, true);
    void control.zoomTo(Math.min(80, 300 / Math.max(zone.size[0], zone.size[1] * 1.4)), true);
  }, [focus]);

  const headline = world.live
    ? world.mainActivity === "waiting" ? "사용자 확인을 기다리는 중"
      : world.activeSpecialist ? `${AGENT_LABEL[world.activeSpecialist]} 인력에게 작업을 맡겼습니다`
      : world.mainSpot === "dock" ? (world.mainActivity === "celebrating" ? "작업을 끝내고 출고했습니다" : "커밋할 결과를 포장하는 중") : "작업을 나눠 지시하는 중"
    : world.mainActivity === "waiting" ? `확인할 리뷰 ${waitingReviews}개가 카운터에서 기다립니다`
    : world.mainSpot === "spec" ? `시작 전 SPEC ${plannedSpecs}개를 살펴보는 중` : "지금 진행 중인 작업은 없습니다";

  function detail(zone: Zone): string[] {
    switch (zone.id) {
      case "spec": return [`시작 전 SPEC ${plannedSpecs}개`, `전체 일정 ${specs.length}개`];
      case "control": return [headline, lead ? `${lead.kind ? `${lead.kind} · ` : ""}${lead.title}` : ""];
      case "harness": return ["프로젝트 규칙과 체크포인트를 모든 에이전트에게 전달합니다."];
      case "work": return SPECIALISTS.map((agent) => { const title = titleOf(STATION[agent]); const last = lastAt[STATION[agent]]; return `${AGENT_LABEL[agent]} · ${world.activeSpecialists.includes(agent) ? `작업 중${title ? ` · ${title.title}` : ""}` : "대기"}${last ? ` · 마지막 ${relativeTime(last, now)}` : ""}`; });
      case "lounge": { const resting = SPECIALISTS.filter((agent) => !world.activeSpecialists.includes(agent)); return [resting.length ? `대기 중 · ${resting.map((agent) => AGENT_LABEL[agent]).join(", ")}` : "모든 인력이 작업 중입니다"]; }
      case "confirm": return [waitingReviews > 0 ? `확인할 리뷰 ${waitingReviews}개` : "기다리는 확인 요청이 없습니다"];
      case "dock": return [lastAt.commit ? `마지막 출고 ${relativeTime(lastAt.commit, now)}` : "출고 기록 없음"];
      case "weekly": return [`이번 주 완료 ${bins.reduce((sum, count) => sum + count, 0)}건`, DAY.map((day, index) => `${day} ${bins[index]}`).join(" · ")];
      case "domains": return domains.map((domain) => `${domain.name} · 진행 ${domain.activeTaskCount} · 완료 ${domain.roadmap.done}`);
    }
  }
  const focused = focus ? ZONES.find((zone) => zone.id === focus)! : null;
  const hovered = hover && !focus ? ZONES.find((zone) => zone.id === hover)! : null;

  return <div className="work-world">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${world.live ? "bg-cyan-300 ck-pulse-dot" : world.mainActivity === "waiting" ? "bg-violet-300" : "bg-slate-500"}`} />
      <span className="shrink-0 text-[13px] font-semibold text-white">{headline}</span>
      {world.live && world.domain && <span className="shrink-0 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] px-1.5 py-0.5 text-[11px] text-cyan-100">{world.domain}</span>}
      {lead && <span className="min-w-0 truncate text-[12px] text-slate-400">{lead.kind ? `${lead.kind} · ` : ""}{lead.title}</span>}
      {world.live && world.at && <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500">{relativeTime(world.at, now)}</span>}
    </div>
    <div className="relative mt-2 h-[540px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#0b1220]">
      <Canvas shadows dpr={[1, 2]} onPointerMissed={() => setFocus(null)}>
        <Scene data={{ placement, world, plannedSpecs, bins, domains, waitingReviews, working: world.activeSpecialists }} hover={hover} setHover={setHover} onSelect={setFocus} controls={controls} />
      </Canvas>
      {hovered && <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-300 shadow-xl"><div className="font-semibold text-white">{hovered.label}</div>{detail(hovered).filter(Boolean).slice(0, 2).map((line) => <div key={line} className="mt-0.5">{line}</div>)}</div>}
      {focused && <aside className="absolute inset-y-3 right-3 flex w-72 flex-col rounded-xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: focused.tint }}>{focused.page}</div><h3 className="mt-1 text-[15px] font-semibold text-white">{focused.label}</h3></div><button type="button" aria-label="닫기" onClick={() => setFocus(null)} className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"><X size={15} /></button></div>
        <div className="mt-3 space-y-1.5 text-[12px] leading-5 text-slate-300">{detail(focused).filter(Boolean).map((line) => <p key={line}>{line}</p>)}</div>
        <button type="button" onClick={() => navigate(focused.route)} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-[12px] font-semibold text-cyan-100 hover:bg-cyan-300/20">{focused.page} 열기<ArrowRight size={13} /></button>
      </aside>}
    </div>
  </div>;
}
