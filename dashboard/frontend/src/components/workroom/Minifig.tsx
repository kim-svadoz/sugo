import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { FigurePose, Vec2 } from "../../lib/workRoom.js";

export type FigureRole = "main" | "code" | "test" | "review" | "docs";

const SKIN = "#f5c542";
const LOOK: Record<FigureRole, { torso: string; legs: string; hips: string }> = {
  main: { torso: "#0e7490", legs: "#475569", hips: "#334155" },
  code: { torso: "#1e3a5f", legs: "#334155", hips: "#1e293b" },
  test: { torso: "#e2e8f0", legs: "#475569", hips: "#334155" },
  review: { torso: "#6d28d9", legs: "#1e293b", hips: "#111827" },
  docs: { torso: "#047857", legs: "#78350f", hips: "#5b2a0b" },
};
const SPEED = 2.6;

function Plastic({ color, emissive }: { color: string; emissive?: string }) {
  return <meshStandardMaterial color={color} roughness={0.38} metalness={0.02} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.9 : 0} />;
}

function HeadWear({ role }: { role: FigureRole }) {
  switch (role) {
    case "main":
      return <group>
        <mesh position={[0, 0.17, -0.02]} castShadow><cylinderGeometry args={[0.235, 0.235, 0.1, 24]} /><Plastic color="#3b2a1f" /></mesh>
        <mesh position={[0, 0.02, -0.12]}><boxGeometry args={[0.44, 0.26, 0.2]} /><Plastic color="#3b2a1f" /></mesh>
        <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0]}><torusGeometry args={[0.27, 0.025, 8, 24, Math.PI]} /><Plastic color="#475569" /></mesh>
        <mesh position={[0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 0.07, 16]} /><Plastic color="#334155" /></mesh>
        <mesh position={[-0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 0.07, 16]} /><Plastic color="#334155" /></mesh>
        <mesh position={[0.18, -0.1, 0.17]} rotation={[0.3, 0, 0.9]}><cylinderGeometry args={[0.015, 0.015, 0.22, 6]} /><Plastic color="#475569" /></mesh>
        <mesh position={[0.1, -0.15, 0.24]}><sphereGeometry args={[0.03, 8, 8]} /><Plastic color="#22d3ee" emissive="#22d3ee" /></mesh>
      </group>;
    case "code":
      return <group>
        <mesh position={[0, 0.12, 0]} castShadow><sphereGeometry args={[0.27, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><Plastic color="#f97316" /></mesh>
        <mesh position={[0, 0.12, 0.02]}><cylinderGeometry args={[0.32, 0.32, 0.03, 24]} /><Plastic color="#ea580c" /></mesh>
      </group>;
    case "test":
      return <group>
        <mesh position={[0, 0.17, -0.02]}><cylinderGeometry args={[0.235, 0.235, 0.08, 24]} /><Plastic color="#1f2937" /></mesh>
        <mesh position={[0, 0.1, 0.13]}><boxGeometry args={[0.4, 0.09, 0.12]} /><Plastic color="#22d3ee" emissive="#0e7490" /></mesh>
      </group>;
    case "review":
      return <group>
        <mesh position={[0, 0.17, -0.03]}><cylinderGeometry args={[0.235, 0.235, 0.08, 24]} /><Plastic color="#111827" /></mesh>
        <mesh position={[0.08, 0.03, 0.225]}><torusGeometry args={[0.055, 0.012, 6, 16]} /><Plastic color="#0f172a" /></mesh>
        <mesh position={[-0.08, 0.03, 0.225]}><torusGeometry args={[0.055, 0.012, 6, 16]} /><Plastic color="#0f172a" /></mesh>
      </group>;
    case "docs":
      return <group>
        <mesh position={[0.03, 0.18, 0]} rotation={[0, 0, -0.18]} scale={[1, 0.35, 1]} castShadow><sphereGeometry args={[0.28, 20, 12]} /><Plastic color="#b45309" /></mesh>
        <mesh position={[0.25, 0.04, 0.02]} rotation={[0, 0, 0.6]}><cylinderGeometry args={[0.018, 0.018, 0.26, 6]} /><Plastic color="#fbbf24" /></mesh>
      </group>;
  }
}

function TorsoDetail({ role }: { role: FigureRole }) {
  if (role === "main") return <mesh position={[-0.13, 1.0, 0.165]}><boxGeometry args={[0.13, 0.17, 0.01]} /><Plastic color="#e2e8f0" /></mesh>;
  if (role === "code") return <group>{[-0.17, 0.17].map((x) => <mesh key={x} position={[x, 1.0, 0.162]}><boxGeometry args={[0.16, 0.56, 0.01]} /><Plastic color="#f97316" /></mesh>)}<mesh position={[0, 0.94, 0.168]}><boxGeometry args={[0.58, 0.05, 0.01]} /><Plastic color="#fde047" /></mesh></group>;
  if (role === "review") return <mesh position={[0, 1.08, 0.165]}><boxGeometry args={[0.05, 0.3, 0.01]} /><Plastic color="#fbbf24" /></mesh>;
  if (role === "docs") return <mesh position={[0, 1.05, 0.165]}><boxGeometry args={[0.16, 0.42, 0.01]} /><Plastic color="#d1fae5" /></mesh>;
  return <mesh position={[0.15, 1.08, 0.165]}><boxGeometry args={[0.1, 0.12, 0.01]} /><Plastic color="#94a3b8" /></mesh>;
}

/** 레고형 인물. 목표 위치가 바뀌면 걸어가고, 도착하면 자세를 취한다. 앞쪽은 로컬 +z다. */
export function Minifig({ role, position, facing, pose, held }: { role: FigureRole; position: Vec2; facing: number; pose: FigurePose; held?: "mug" | "card" | "brick" }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const look = LOOK[role];

  useFrame((state, delta) => {
    const g = root.current;
    if (!g || !body.current || !legL.current || !legR.current || !armL.current || !armR.current) return;
    const t = state.clock.elapsedTime;
    const dx = position[0] - g.position.x;
    const dz = position[1] - g.position.z;
    const distance = Math.hypot(dx, dz);
    const walking = distance > 0.04;
    if (walking) {
      const step = Math.min(distance, SPEED * delta);
      g.position.x += (dx / distance) * step;
      g.position.z += (dz / distance) * step;
    }
    const targetYaw = walking ? Math.atan2(dx, dz) : facing;
    let diff = targetYaw - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, delta * 8);

    const seated = !walking && (pose === "sit" || pose === "type");
    const legSwing = walking ? Math.sin(t * 11) * 0.6 : 0;
    legL.current.rotation.x = seated ? -Math.PI / 2 : legSwing;
    legR.current.rotation.x = seated ? -Math.PI / 2 : -legSwing;
    body.current.position.y = seated ? -0.2 : pose === "celebrate" && !walking ? Math.abs(Math.sin(t * 6)) * 0.28 : walking ? Math.abs(Math.sin(t * 11)) * 0.04 : Math.sin(t * 2) * 0.008;

    let left = 0; let right = 0; let rightZ = 0;
    if (walking) { left = -legSwing * 0.8; right = legSwing * 0.8; }
    else if (pose === "type") { left = -1.25 + Math.sin(t * 14) * 0.12; right = -1.25 + Math.sin(t * 14 + 1.6) * 0.12; }
    else if (pose === "stand") { right = -0.95 + Math.sin(t * 2.2) * 0.25; left = -0.15; }
    else if (pose === "wave") { right = -2.9; rightZ = Math.sin(t * 6) * 0.35; left = -0.1; }
    else if (pose === "celebrate") { left = -2.9; right = -2.9; }
    else if (pose === "sip") { left = (Math.sin(t * 0.9) > 0.6 ? -2.0 : -0.9); right = -0.1; }
    else { left = -0.35; right = -0.35; }
    armL.current.rotation.x += (left - armL.current.rotation.x) * Math.min(1, delta * 10);
    armR.current.rotation.x += (right - armR.current.rotation.x) * Math.min(1, delta * 10);
    armR.current.rotation.z += (rightZ - armR.current.rotation.z) * Math.min(1, delta * 10);
  });

  return <group ref={root} position={[position[0], 0, position[1]]} rotation={[0, facing, 0]}>
    <group ref={body}>
      <group ref={legL} position={[-0.15, 0.6, 0]}><mesh position={[0, -0.29, 0]} castShadow><boxGeometry args={[0.28, 0.58, 0.32]} /><Plastic color={look.legs} /></mesh><mesh position={[0, -0.55, 0.06]}><boxGeometry args={[0.28, 0.1, 0.42]} /><Plastic color={look.hips} /></mesh></group>
      <group ref={legR} position={[0.15, 0.6, 0]}><mesh position={[0, -0.29, 0]} castShadow><boxGeometry args={[0.28, 0.58, 0.32]} /><Plastic color={look.legs} /></mesh><mesh position={[0, -0.55, 0.06]}><boxGeometry args={[0.28, 0.1, 0.42]} /><Plastic color={look.hips} /></mesh></group>
      <mesh position={[0, 0.66, 0]} castShadow><boxGeometry args={[0.6, 0.12, 0.34]} /><Plastic color={look.hips} /></mesh>
      <mesh position={[0, 1.0, 0]} castShadow><boxGeometry args={[0.6, 0.58, 0.32]} /><Plastic color={look.torso} /></mesh>
      <TorsoDetail role={role} />
      <group ref={armL} position={[-0.36, 1.24, 0]}><mesh position={[0, -0.22, 0]} castShadow><cylinderGeometry args={[0.085, 0.09, 0.46, 12]} /><Plastic color={look.torso} /></mesh><mesh position={[0, -0.48, 0.02]}><cylinderGeometry args={[0.07, 0.07, 0.1, 12]} /><Plastic color={SKIN} /></mesh>
        {held === "mug" && <mesh position={[0, -0.52, 0.12]}><cylinderGeometry args={[0.07, 0.07, 0.14, 12]} /><Plastic color="#f8fafc" /></mesh>}</group>
      <group ref={armR} position={[0.36, 1.24, 0]}><mesh position={[0, -0.22, 0]} castShadow><cylinderGeometry args={[0.085, 0.09, 0.46, 12]} /><Plastic color={look.torso} /></mesh><mesh position={[0, -0.48, 0.02]}><cylinderGeometry args={[0.07, 0.07, 0.1, 12]} /><Plastic color={SKIN} /></mesh>
        {held === "card" && <mesh position={[0, -0.55, 0.1]} rotation={[0.4, 0, 0]}><boxGeometry args={[0.18, 0.02, 0.24]} /><Plastic color="#f8fafc" /></mesh>}
        {held === "brick" && <mesh position={[0, -0.58, 0.08]}><boxGeometry args={[0.2, 0.12, 0.14]} /><Plastic color="#fbbf24" /></mesh>}</group>
      <mesh position={[0, 1.32, 0]}><cylinderGeometry args={[0.11, 0.11, 0.06, 12]} /><Plastic color={SKIN} /></mesh>
      <group position={[0, 1.5, 0]}>
        <mesh castShadow><cylinderGeometry args={[0.22, 0.22, 0.3, 24]} /><Plastic color={SKIN} /></mesh>
        <mesh position={[0, 0.19, 0]}><cylinderGeometry args={[0.11, 0.11, 0.08, 16]} /><Plastic color={SKIN} /></mesh>
        <mesh position={[-0.075, 0.03, 0.215]}><boxGeometry args={[0.04, 0.06, 0.01]} /><Plastic color="#0f172a" /></mesh>
        <mesh position={[0.075, 0.03, 0.215]}><boxGeometry args={[0.04, 0.06, 0.01]} /><Plastic color="#0f172a" /></mesh>
        <mesh position={[0, -0.07, 0.215]}><boxGeometry args={[0.1, 0.02, 0.01]} /><Plastic color="#0f172a" /></mesh>
        <HeadWear role={role} />
      </group>
    </group>
  </group>;
}
