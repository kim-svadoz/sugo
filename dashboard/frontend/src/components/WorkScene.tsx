import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { selectWorkScene, type WorkPose } from "../lib/workScene.js";

const BRICK = { cyan: "#22d3ee", violet: "#a78bfa", amber: "#fbbf24", emerald: "#34d399", rose: "#fb7185", slate: "#64748b" };

function Brick({ x, y, w = 16, color, className, studs = 2 }: { x: number; y: number; w?: number; color: string; className?: string; studs?: number }) {
  const gap = w / studs;
  return <g className={className}>
    {Array.from({ length: studs }, (_, index) => <rect key={index} x={x + gap * index + gap / 2 - 2.2} y={y - 2.2} width={4.4} height={2.6} rx={0.8} fill={color} />)}
    <rect x={x} y={y} width={w} height={8} rx={1.4} fill={color} />
    <rect x={x} y={y + 5.6} width={w} height={2.4} rx={1} fill="#000" opacity={0.18} />
  </g>;
}

/** 레고형 작업자. 오른손(화면 기준 오른쪽)이 소품을 다룬다. */
function Figure({ pose, rightHand, leftHand }: { pose: WorkPose; rightHand?: ReactNode; leftHand?: ReactNode }) {
  return <g className={`wf-figure wf-figure--${pose}`}>
    <g className="wf-arm wf-arm-l">
      <path d="M24 26 l-5 3 l-2.5 13 l5 1 l3.2 -11 z" fill="#0e7490" />
      <circle cx="19" cy="45" r="3.2" fill="#f5c542" />
      {leftHand}
    </g>
    <rect x="21" y="45" width="26" height="4" rx="1" fill="#334155" />
    <rect x="21" y="49" width="12.5" height="20" rx="1.5" fill="#475569" />
    <rect x="34.5" y="49" width="12.5" height="20" rx="1.5" fill="#475569" />
    <rect x="20" y="68" width="14" height="4" rx="1.5" fill="#334155" />
    <rect x="34" y="68" width="14" height="4" rx="1.5" fill="#334155" />
    <path d="M24 25 H44 L47 45 H21 Z" fill="#0e7490" />
    <path d="M27 25 H41 L42.5 31 H25.5 Z" fill="#155e75" />
    <rect className="wf-core" x="31" y="32" width="6" height="6" rx="1.6" fill="#67e8f9" />
    <rect x="30" y="23" width="8" height="2.5" fill="#d4a72c" />
    <rect x="29" y="4" width="10" height="4.5" rx="1.2" fill="#f5c542" />
    <rect x="25" y="8" width="18" height="15.5" rx="4.5" fill="#f5c542" />
    <g className="wf-eyes">
      <rect x="29.4" y="13.2" width="2.8" height="3.6" rx="1.3" fill="#0f172a" />
      <rect x="35.8" y="13.2" width="2.8" height="3.6" rx="1.3" fill="#0f172a" />
    </g>
    <path d="M31 19.4 q3 2 6 0" stroke="#0f172a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    <g className="wf-arm wf-arm-r">
      <path d="M44 26 l5 3 l2.5 13 l-5 1 l-3.2 -11 z" fill="#0e7490" />
      <circle cx="49" cy="45" r="3.2" fill="#f5c542" />
      {rightHand}
    </g>
  </g>;
}

function Tool({ kind }: { kind: "wrench" | "magnifier" | "clipboard" | "pen" }) {
  if (kind === "wrench") return <path d="M50 44 l9 -10 m-1.5 -3 a3.2 3.2 0 1 0 4 4" stroke="#cbd5e1" strokeWidth="2.4" fill="none" strokeLinecap="round" />;
  if (kind === "magnifier") return <g><circle cx="58" cy="34" r="5" stroke="#cbd5e1" strokeWidth="2" fill="#22d3ee" fillOpacity="0.15" /><path d="M54.5 37.5 L50 44" stroke="#cbd5e1" strokeWidth="2.4" strokeLinecap="round" /></g>;
  if (kind === "clipboard") return <g><rect x="51" y="30" width="11" height="14" rx="1.5" fill="#e2e8f0" /><rect x="54" y="28.5" width="5" height="3" rx="1" fill="#64748b" /><path d="M53.5 35 h6 M53.5 38.5 h6" stroke="#64748b" strokeWidth="1" /></g>;
  return <path d="M50 45 L60 31" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" />;
}

function Props({ pose }: { pose: WorkPose }) {
  switch (pose) {
    case "reviewing-board":
      return <g>
        <rect x="78" y="10" width="86" height="50" rx="4" fill="#0f172a" stroke="#1e293b" />
        <rect x="76" y="58" width="90" height="4" rx="1" fill="#1e293b" />
        {[0, 1, 2, 3].map((index) => <rect key={index} className="wf-bar" style={{ animationDelay: `${index * 0.35}s` }} x={88 + index * 16} y="24" width="9" height="28" rx="1.5" fill={[BRICK.cyan, BRICK.violet, BRICK.emerald, BRICK.amber][index]} />)}
        <g className="wf-blink-check"><circle cx="154" cy="20" r="5" fill={BRICK.emerald} /><path d="M151.5 20 l2 2 l3.5 -4" stroke="#0f172a" strokeWidth="1.6" fill="none" /></g>
        <g className="wf-steam"><path d="M180 44 q-2 -4 0 -8 q2 -4 0 -8" stroke="#94a3b8" strokeWidth="1.2" fill="none" /></g>
        <rect x="174" y="46" width="12" height="13" rx="2" fill="#e2e8f0" /><path d="M186 49 q5 0 5 4 q0 4 -5 4" stroke="#e2e8f0" strokeWidth="1.8" fill="none" />
      </g>;
    case "sorting":
      return <g>
        {[0, 1, 2].map((index) => <g key={index}><path d={`M${104 + index * 36} 54 h26 l-2 18 h-22 z`} fill="#1e293b" stroke={[BRICK.cyan, BRICK.violet, BRICK.amber][index]} strokeOpacity="0.6" /></g>)}
        {[0, 1, 2].map((index) => <g key={index} className={`wf-sort wf-sort-${index}`}><Brick x={54} y={36} w={14} color={[BRICK.cyan, BRICK.violet, BRICK.amber][index]} /></g>)}
      </g>;
    case "planning":
      return <g>
        <rect x="84" y="20" width="116" height="52" rx="3" fill="#0f172a" stroke="#1e293b" />
        {Array.from({ length: 15 }, (_, index) => <rect key={index} x={90 + (index % 5) * 22} y={26 + Math.floor(index / 5) * 15} width="18" height="11" rx="1.5" fill="#1e293b" />)}
        {[[0, 1, BRICK.cyan], [2, 0, BRICK.violet], [3, 2, BRICK.amber]].map(([col, row, color], index) => <g key={index} className="wf-drop" style={{ animationDelay: `${index * 1.1}s` }}><Brick x={91 + Number(col) * 22} y={27 + Number(row) * 15} w={16} color={String(color)} /></g>)}
      </g>;
    case "stacking":
      return <g>
        <rect x="96" y="70" width="60" height="3" rx="1" fill="#1e293b" />
        {[0, 1, 2, 3, 4].map((index) => <g key={index} className="wf-stack" style={{ animationDelay: `${index * 0.8}s` }}><Brick x={106 + (index % 2) * 6} y={60 - index * 10} w={30} studs={3} color={[BRICK.cyan, BRICK.violet, BRICK.emerald, BRICK.amber, BRICK.rose][index]} /></g>)}
      </g>;
    case "switching-tools":
      return <g>
        {["code", "test", "review", "docs"].map((name, index) => <g key={name} className="wf-slot" style={{ animationDelay: `${index * 1.5}s` }}>
          <rect x={92 + index * 30} y="26" width="24" height="34" rx="3" fill="#0f172a" stroke={[BRICK.cyan, BRICK.emerald, BRICK.violet, BRICK.amber][index]} strokeOpacity="0.7" />
          <rect x={98 + index * 30} y="32" width="12" height="12" rx="2" fill={[BRICK.cyan, BRICK.emerald, BRICK.violet, BRICK.amber][index]} opacity="0.7" />
          <rect x={97 + index * 30} y="49" width="14" height="2" rx="1" fill="#334155" />
        </g>)}
      </g>;
    case "reading-manual":
      return <g>
        {[0, 1, 2, 3].map((index) => <g key={index} className="wf-step" style={{ animationDelay: `${index * 0.9}s` }}><Brick x={100 + index * 26} y={56 - index * 8} w={18} color={[BRICK.cyan, BRICK.violet, BRICK.emerald, BRICK.amber][index]} /></g>)}
        <path d="M118 66 L196 34" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
      </g>;
    case "measuring":
      return <g>
        <Brick x={110} y={58} w={48} studs={4} color={BRICK.violet} />
        <g className="wf-ruler"><rect x="104" y="40" width="60" height="7" rx="1" fill="#fbbf24" />{Array.from({ length: 11 }, (_, index) => <rect key={index} x={107 + index * 5.4} y="40" width="0.9" height={index % 2 ? 2.5 : 4} fill="#78350f" />)}</g>
        <g className="wf-blink-check"><circle cx="176" cy="54" r="6" fill={BRICK.emerald} /><path d="M173 54 l2.2 2.2 l4 -4.5" stroke="#0f172a" strokeWidth="1.8" fill="none" /></g>
      </g>;
    case "connecting":
      return <g>
        <Brick x={100} y={50} w={32} studs={4} color={BRICK.cyan} />
        <g className="wf-snap"><Brick x={160} y={42} w={32} studs={4} color={BRICK.violet} /></g>
        <circle className="wf-spark" cx="148" cy="50" r="7" fill="none" stroke="#67e8f9" strokeWidth="1.5" />
        <path d="M80 64 q20 -12 20 -8" stroke="#334155" strokeWidth="1.5" fill="none" />
      </g>;
    case "tuning":
      return <g>
        <rect x="96" y="22" width="96" height="46" rx="4" fill="#0f172a" stroke="#1e293b" />
        <g className="wf-dial"><circle cx="122" cy="45" r="12" fill="#1e293b" stroke="#22d3ee" strokeOpacity="0.6" /><rect x="121" y="34" width="2" height="9" rx="1" fill="#67e8f9" /></g>
        {[0, 1].map((index) => <g key={index}><rect x="146" y={36 + index * 16} width="36" height="3" rx="1.5" fill="#334155" /><circle className="wf-knob" style={{ animationDelay: `${index * 1.2}s` }} cx="152" cy={37.5 + index * 16} r="4" fill={index ? BRICK.violet : BRICK.amber} /></g>)}
      </g>;
    case "briefing":
      return <g>
        <rect x="96" y="14" width="56" height="56" rx="3" fill="#e2e8f0" />
        {[0, 1, 2, 3].map((index) => <rect key={index} className="wf-line" style={{ animationDelay: `${index * 0.6}s` }} x="104" y={24 + index * 11} width={index === 0 ? 30 : 40} height="3" rx="1.5" fill={index === 0 ? "#0e7490" : "#94a3b8"} />)}
        {[0, 1, 2].map((index) => <rect key={index} className="wf-note" style={{ animationDelay: `${index * 0.7}s` }} x={162} y={18 + index * 18} width="22" height="14" rx="1.5" fill={[BRICK.amber, BRICK.cyan, BRICK.violet][index]} opacity="0.85" />)}
      </g>;
    case "building":
      return <g>
        <rect x="92" y="70" width="104" height="3" rx="1" fill="#1e293b" />
        {Array.from({ length: 8 }, (_, index) => <g key={index} className="wf-build" style={{ animationDelay: `${index * 0.35}s` }}><Brick x={96 + (index % 4) * 24 + (Math.floor(index / 4) ? 12 : 0)} y={60 - Math.floor(index / 4) * 10} w={22} studs={3} color={[BRICK.cyan, BRICK.violet, BRICK.emerald, BRICK.amber][index % 4]} /></g>)}
      </g>;
    case "inspecting":
      return <g>
        {[0, 1, 2].map((index) => <Brick key={index} x={100 + index * 30} y={56} w={24} studs={3} color={[BRICK.cyan, BRICK.violet, BRICK.amber][index]} />)}
        <g className="wf-scan"><circle cx="112" cy="46" r="10" stroke="#cbd5e1" strokeWidth="2.4" fill="#22d3ee" fillOpacity="0.12" /><path d="M119 53 L126 60" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" /></g>
        {[0, 1, 2].map((index) => <g key={index} className="wf-pass" style={{ animationDelay: `${index * 1}s` }}><circle cx={112 + index * 30} cy="28" r="5" fill={BRICK.emerald} /><path d={`M${109.5 + index * 30} 28 l2 2 l3.5 -4`} stroke="#0f172a" strokeWidth="1.6" fill="none" /></g>)}
      </g>;
    case "reviewing":
      return <g>
        <rect x="100" y="12" width="60" height="60" rx="3" fill="#e2e8f0" /><rect x="118" y="9" width="24" height="7" rx="2" fill="#64748b" />
        {[0, 1, 2, 3].map((index) => <g key={index}>
          <rect x="107" y={24 + index * 11} width="7" height="7" rx="1" fill="none" stroke="#64748b" />
          <path className="wf-tick" style={{ animationDelay: `${index * 0.7}s` }} d={`M108 ${27.5 + index * 11} l2 2 l4 -4.5`} stroke="#059669" strokeWidth="1.8" fill="none" />
          <rect x="119" y={26 + index * 11} width="32" height="2.5" rx="1" fill="#94a3b8" />
        </g>)}
      </g>;
    case "writing":
      return <g>
        <path d="M100 16 h40 v54 h-40 z M140 16 h40 v54 h-40 z" fill="#e2e8f0" /><rect x="139" y="16" width="2" height="54" fill="#94a3b8" />
        {[0, 1, 2].map((index) => <g key={index} className="wf-step" style={{ animationDelay: `${index * 0.6}s` }}><Brick x={106 + index * 10} y={56 - index * 9} w={12} studs={1} color={[BRICK.cyan, BRICK.violet, BRICK.amber][index]} /></g>)}
        {[0, 1, 2, 3].map((index) => <rect key={index} className="wf-line" style={{ animationDelay: `${index * 0.5}s` }} x="146" y={26 + index * 10} width="28" height="2.5" rx="1" fill="#64748b" />)}
      </g>;
    case "celebrating":
      return <g>
        {[[96, 20], [180, 26], [140, 12], [120, 56], [190, 58]].map(([cx, cy], index) => <path key={index} className="wf-sparkle" style={{ animationDelay: `${index * 0.3}s` }} d={`M${cx} ${Number(cy) - 5} L${Number(cx) + 1.5} ${Number(cy) - 1.5} L${Number(cx) + 5} ${cy} L${Number(cx) + 1.5} ${Number(cy) + 1.5} L${cx} ${Number(cy) + 5} L${Number(cx) - 1.5} ${Number(cy) + 1.5} L${Number(cx) - 5} ${cy} L${Number(cx) - 1.5} ${Number(cy) - 1.5} Z`} fill={[BRICK.amber, BRICK.cyan, BRICK.violet, BRICK.emerald, BRICK.rose][index]} />)}
        <rect x="104" y="62" width="76" height="10" rx="2" fill="#1e293b" />
        {[0, 1, 2].map((index) => <Brick key={index} x={112 + index * 20} y={54 - (index === 1 ? 8 : 0)} w={18} color={[BRICK.cyan, BRICK.violet, BRICK.emerald][index]} />)}
      </g>;
  }
}

function heldItem(pose: WorkPose): { right?: ReactNode; left?: ReactNode } {
  switch (pose) {
    case "switching-tools": return { right: <>{(["wrench", "magnifier", "clipboard", "pen"] as const).map((kind, index) => <g key={kind} className="wf-tool" style={{ animationDelay: `${index * 1.5}s` }}><Tool kind={kind} /></g>)}</> };
    case "reading-manual": return { right: <g><rect x="48" y="30" width="16" height="16" rx="1" fill="#e2e8f0" /><rect className="wf-page" x="56" y="30" width="8" height="16" fill="#cbd5e1" /></g> };
    case "measuring": return { right: <Tool kind="pen" /> };
    case "inspecting": return { right: <Tool kind="magnifier" /> };
    case "reviewing": return { right: <Tool kind="pen" /> };
    case "writing": return { right: <Tool kind="pen" /> };
    case "briefing": return { right: <Tool kind="clipboard" /> };
    case "building": return { right: <Brick x={47} y={36} w={12} studs={2} color={BRICK.amber} /> };
    case "celebrating": return { right: <Brick x={42} y={47} w={14} color={BRICK.amber} /> };
    case "tuning": return { right: <Tool kind="wrench" /> };
    default: return {};
  }
}

export function WorkScene({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  const events = useActivityStream();
  const scene = selectWorkScene(pathname, events);
  const held = heldItem(scene.pose);
  return <figure className={`wf relative m-0 shrink-0 ${className}`} aria-label={`작업자 · ${scene.label}`} title={scene.detail ?? scene.label} data-pose={scene.pose}>
    <svg viewBox="0 0 210 80" className="h-[64px] w-[168px] overflow-visible" role="img" aria-hidden="true">
      <rect x="0" y="73" width="210" height="6" rx="2" fill="#0f172a" />
      {Array.from({ length: 14 }, (_, index) => <rect key={index} x={6 + index * 15} y="71.4" width="6" height="2" rx="0.8" fill="#1e293b" />)}
      <Props pose={scene.pose} />
      <Figure pose={scene.pose} rightHand={held.right} leftHand={held.left} />
    </svg>
    {scene.live && <figcaption className="absolute -top-5 right-0 flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold text-cyan-200"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300 ck-pulse-dot" />{scene.label}</figcaption>}
  </figure>;
}
