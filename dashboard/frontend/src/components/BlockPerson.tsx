import type { ReactNode } from "react";

/** 레고형 인물. 발 중앙이 (0,0)이다. 메인 에이전트와 전문 인력은 머리·옷·소품으로 구분한다. */
export type PersonRole = "main" | "code" | "test" | "review" | "docs";

const SKIN = "#f5c542";
const OUTFIT: Record<PersonRole, { top: string; trim: string; legs: string; legs2: string }> = {
  main: { top: "#0e7490", trim: "#155e75", legs: "#475569", legs2: "#3f4b5e" },
  code: { top: "#1e3a5f", trim: "#f97316", legs: "#334155", legs2: "#2b3647" },
  test: { top: "#e2e8f0", trim: "#94a3b8", legs: "#475569", legs2: "#3f4b5e" },
  review: { top: "#6d28d9", trim: "#4c1d95", legs: "#1e293b", legs2: "#172033" },
  docs: { top: "#047857", trim: "#065f46", legs: "#78350f", legs2: "#6b2f0d" },
};

function Head({ role }: { role: PersonRole }) {
  return <g>
    <rect x="-4" y="-67.5" width="8" height="3.5" fill="#d4a72c" />
    <rect x="-12.5" y="-91" width="25" height="24" rx="6.5" fill={SKIN} />
    <g className="wk-eyes"><rect x="-7" y="-80" width="3.4" height="4.4" rx="1.6" fill="#0f172a" /><rect x="3.4" y="-80" width="3.4" height="4.4" rx="1.6" fill="#0f172a" /></g>
    <path d="M-3.6 -72.5 q3.6 2.6 7.2 0" stroke="#0f172a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    {role === "main" && <g>
      <path d="M-7.5 -83 h4 M3 -83 h4" stroke="#78350f" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M-13.5 -80 q-1 -17 13.5 -17 q15 0 14 15 l-4 -4 q-6 5 -15 0 q-3 5 -8.5 6 z" fill="#3b2a1f" />
      <path d="M-15 -78 q0 -22 15 -22 q15 0 15 22" stroke="#475569" strokeWidth="2.6" fill="none" />
      <rect x="11.5" y="-84" width="6" height="11" rx="2.5" fill="#334155" />
      <circle cx="14.5" cy="-78.5" r="1.4" fill="#22d3ee" className="wk-led" />
      <path d="M14 -74 q-2 5 -8 5.5" stroke="#475569" strokeWidth="1.6" fill="none" />
      <circle cx="5.5" cy="-68.5" r="1.8" fill="#334155" />
    </g>}
    {role === "code" && <g>
      <path d="M-15 -86 q0 -15 15 -15 q15 0 15 15 z" fill="#f97316" />
      <rect x="-17" y="-87" width="34" height="4" rx="2" fill="#ea580c" />
      <rect x="-2" y="-100" width="4" height="12" rx="1.5" fill="#fdba74" />
    </g>}
    {role === "test" && <g>
      <path d="M-13 -82 q0 -15 13 -15 q13 0 13 15 q-3 -6 -13 -6 q-10 0 -13 6 z" fill="#1f2937" />
      <rect x="-12" y="-93" width="24" height="7" rx="3.5" fill="#22d3ee" opacity="0.85" />
      <rect x="-13" y="-91" width="26" height="2.5" fill="#0e7490" />
    </g>}
    {role === "review" && <g>
      <path d="M-13 -82 q0 -16 13 -16 q14 0 13 14 q-8 -9 -18 -5 q-4 2 -8 7 z" fill="#111827" />
      <g fill="none" stroke="#0f172a" strokeWidth="1.3"><rect x="-9" y="-81.5" width="7" height="6" rx="2" /><rect x="2" y="-81.5" width="7" height="6" rx="2" /><path d="M-2 -79 h4" /></g>
    </g>}
    {role === "docs" && <g>
      <path d="M-15 -88 q2 -12 17 -11 q12 1 13 9 q-14 -3 -30 2 z" fill="#b45309" />
      <circle cx="9" cy="-100" r="2" fill="#b45309" />
      <path d="M12 -84 l6 -8" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-13 -86 q0 -4 3 -6" stroke="#57534e" strokeWidth="3" />
    </g>}
  </g>;
}

function Torso({ role }: { role: PersonRole }) {
  const outfit = OUTFIT[role];
  return <g>
    <path d="M-13 -64 H13 L15.5 -36 H-15.5 Z" fill={outfit.top} />
    {role === "main" && <g>
      <path d="M-6 -64 L0 -57 L6 -64" fill={outfit.trim} /><path d="M0 -57 V-37" stroke={outfit.trim} strokeWidth="1.4" />
      <path d="M-6 -63 L-5 -52 M5 -63 L4 -54" stroke="#cbd5e1" strokeWidth="0.9" />
      <rect x="-9.5" y="-53" width="7.5" height="10" rx="1.2" fill="#e2e8f0" /><rect x="-9.5" y="-53" width="7.5" height="2.6" rx="1" fill="#22d3ee" />
    </g>}
    {role === "code" && <g>
      <path d="M-12 -63 H-4 L-3 -37 H-14 Z M12 -63 H4 L3 -37 H14 Z" fill="#f97316" />
      <rect x="-14" y="-50" width="28" height="2.5" fill="#fde047" />
    </g>}
    {role === "test" && <g>
      <path d="M-2 -64 L0 -38 L2 -64" stroke="#94a3b8" strokeWidth="1" fill="none" />
      <rect x="4" y="-56" width="7" height="8" rx="1" fill="#cbd5e1" /><path d="M6 -57 v-4 M9 -57 v-3" stroke="#22d3ee" strokeWidth="1.5" />
    </g>}
    {role === "review" && <g>
      <path d="M-5 -64 L0 -54 L5 -64 Z" fill="#e2e8f0" /><path d="M-1 -60 L0 -45 L1 -60 Z" fill="#fbbf24" />
    </g>}
    {role === "docs" && <g>
      <path d="M-5 -64 L0 -40 L5 -64" fill="#d1fae5" opacity="0.85" />
      {[-56, -50, -44].map((y) => <circle key={y} cx="-3" cy={y} r="1" fill="#065f46" />)}
    </g>}
    <rect x="-14.5" y="-36" width="29" height="6" rx="1.5" fill="#1e293b" />
  </g>;
}

export function BlockPerson({ role, className = "", seated = false, rightHand, leftHand, extra }: { role: PersonRole; className?: string; seated?: boolean; rightHand?: ReactNode; leftHand?: ReactNode; extra?: ReactNode }) {
  const outfit = OUTFIT[role];
  const sleeve = role === "code" ? "#1e3a5f" : outfit.top;
  return <g className={`wk ${className}`}>
    <g className="wk-body" transform={seated ? "translate(0 8)" : undefined}>
      {seated ? <g>
        <rect x="-13" y="-31" width="26" height="8" rx="2" fill={outfit.legs} />
        <rect x="6" y="-31" width="10" height="23" rx="2" fill={outfit.legs2} transform="translate(8 0)" />
        <rect x="12" y="-10" width="15" height="6" rx="2" fill="#1e293b" />
      </g> : <g>
        <g transform="translate(-7 -31)"><g className="wk-leg wk-leg-l"><rect x="-6" y="0" width="12.5" height="27" rx="2" fill={outfit.legs} /><rect x="-7" y="25" width="14" height="6" rx="2" fill="#1e293b" /></g></g>
        <g transform="translate(6.5 -31)"><g className="wk-leg wk-leg-r"><rect x="-6" y="0" width="12.5" height="27" rx="2" fill={outfit.legs2} /><rect x="-6.5" y="25" width="14" height="6" rx="2" fill="#1e293b" /></g></g>
      </g>}
      <Torso role={role} />
      <Head role={role} />
      <g transform="translate(-13 -62)"><g className="wk-arm wk-arm-l"><path d="M0 -1 l-7 4 l-3 18 l7 1 l4 -15 z" fill={sleeve} /><circle cx="-6.5" cy="24" r="4.3" fill={SKIN} /><g transform="translate(13 62)">{leftHand}</g></g></g>
      <g transform="translate(13 -62)"><g className="wk-arm wk-arm-r"><path d="M0 -1 l7 4 l3 18 l-7 1 l-4 -15 z" fill={sleeve} /><circle cx="6.5" cy="24" r="4.3" fill={SKIN} /><g transform="translate(-13 62)">{rightHand}</g></g></g>
    </g>
    {extra}
  </g>;
}

export function Mug() {
  return <g className="wk-mug"><rect x="-27" y="-46" width="10" height="11" rx="2" fill="#e2e8f0" /><path d="M-27 -43 q-4 0 -4 3 q0 3 4 3" stroke="#e2e8f0" strokeWidth="1.6" fill="none" /></g>;
}
