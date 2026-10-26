import {
  Archive,
  BookOpenText,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  FilePenLine,
  FlaskConical,
  GitCommitHorizontal,
  Network,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { useWorkspaces } from "../hooks/useWorkspaces.js";
import { selectWorldState, weekBins, type MainSpot, type Specialist } from "../lib/workWorld.js";

type StationId = "spec" | "control" | "code" | "test" | "review" | "confirm" | "docs" | "dock";

interface Station {
  id: StationId;
  label: string;
  step: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  work: string;
  output: string;
  owner: "human" | "ai";
  role: "사용자 입력" | "사용자 승인" | "AI 실행" | "AI 정리·출고";
  specialist?: Specialist;
}

const HUMAN_ACCENT = "#fbbf24";
const AI_ACCENT = "#67e8f9";

const STATIONS: Station[] = [
  { id: "spec", label: "SPEC 작성", step: "START", icon: FilePenLine, owner: "human", role: "사용자 입력", work: "사용자가 목표와 완료 조건을 정해 개발을 시작합니다.", output: "구현 가능한 SPEC" },
  { id: "control", label: "오케스트레이터", step: "01", icon: Network, owner: "ai", role: "AI 실행", work: "메인 Claude 세션이 현재 상태를 읽고 다음 담당과 실행 순서를 조율합니다.", output: "담당과 근거가 연결된 작업 지시" },
  { id: "code", label: "코드 작성", step: "02", icon: Code2, owner: "ai", role: "AI 실행", specialist: "CODE", work: "코드 에이전트가 SPEC 범위의 제품 코드를 구현합니다.", output: "검증할 구현 결과" },
  { id: "test", label: "테스트", step: "03", icon: FlaskConical, owner: "ai", role: "AI 실행", specialist: "TEST", work: "테스트 에이전트가 요구사항과 회귀 동작을 실행합니다.", output: "통과 또는 실패 실행 증거" },
  { id: "review", label: "검토", step: "04", icon: ShieldCheck, owner: "ai", role: "AI 실행", specialist: "REVIEW", work: "검토 에이전트가 명세와 실행 결과, 남은 위험을 대조합니다.", output: "승인 가능한 결과와 판단 항목" },
  { id: "confirm", label: "사용자 확인", step: "05", icon: UserCheck, owner: "human", role: "사용자 승인", work: "AI가 결정할 수 없는 선택만 사용자에게 요청합니다.", output: "승인 또는 수정 지시" },
  { id: "docs", label: "문서 작업", step: "06", icon: BookOpenText, owner: "ai", role: "AI 정리·출고", specialist: "DOCS", work: "문서 에이전트가 검증된 사용자 동작만 기록합니다.", output: "코드와 일치하는 변경 기록" },
  { id: "dock", label: "커밋 출고", step: "DONE", icon: GitCommitHorizontal, owner: "ai", role: "AI 정리·출고", work: "검증과 문서화가 끝난 결과를 커밋 단위로 보존합니다.", output: "다음 작업이 이어받을 완료 기록" },
];

function activeStation(mainSpot: MainSpot, specialist?: Specialist | null): StationId {
  if (specialist) return specialist === "CODE" ? "code" : specialist === "TEST" ? "test" : specialist === "REVIEW" ? "review" : "docs";
  if (mainSpot === "desk") return "control";
  return mainSpot;
}

function HandwrittenGroup({ children, tone }: { children: string; tone: "human" | "ai" }) {
  const stroke = tone === "human" ? "#fcd34d" : "#67e8f9";
  return <span className={`flex min-w-0 flex-col items-center px-1 ${tone === "human" ? "text-amber-200" : "text-cyan-200/80"}`}>
    <span className="-rotate-1 whitespace-nowrap font-['Nanum_Pen_Script','Gaegu','Bradley_Hand',cursive] text-[13px] font-normal tracking-[0.04em]">{children}</span>
    <svg aria-hidden="true" viewBox="0 0 100 12" preserveAspectRatio="none" className="mt-0.5 h-2.5 w-full overflow-visible opacity-70">
      <path d="M1 1 C8 1 8 9 17 9 H43 C48 9 48 11 50 11 C52 11 52 9 57 9 H83 C92 9 92 1 99 1" fill="none" stroke={stroke} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
}

export function WorkBoard({ specs, waitingReviews }: { specs: ScheduledSpec[]; waitingReviews: number }) {
  const navigate = useNavigate();
  const events = useActivityStream();
  const { data: workspaces } = useWorkspaces();
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<StationId>("spec");
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const plannedSpecs = specs.filter((spec) => !spec.has_run).length;
  const world = selectWorldState(events, now, { waitingReviews, plannedSpecs });
  const active = activeStation(world.mainSpot, world.activeSpecialist);
  const focused = STATIONS.find((station) => station.id === selected)!;
  const bins = useMemo(() => weekBins(specs, new Date(now)), [specs, now]);
  const completedThisWeek = bins.reduce((sum, count) => sum + count, 0);
  const domainCount = workspaces?.length ?? 0;
  useEffect(() => { if (world.live) setSelected(active); }, [active, world.live]);

  return <div className="work-world">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${world.live ? "bg-cyan-300 ck-pulse-dot" : waitingReviews > 0 ? "bg-violet-300" : "bg-slate-500"}`} />
      <strong className="text-[13px] text-white">{world.live ? `${STATIONS.find((station) => station.id === active)?.label ?? "작업"} 진행 중` : waitingReviews > 0 ? `사용자 확인 ${waitingReviews}건 대기 중` : "AI가 다음 작업을 기다리고 있습니다"}</strong>
      <span className="text-[11px] text-slate-500">각 작업대가 한 방향으로 결과를 넘깁니다.</span>
    </div>

    <div className="mt-3 grid min-h-[470px] overflow-hidden rounded-xl border border-white/[0.07] bg-[#080f1c] xl:grid-cols-[minmax(0,6fr)_220px]">
      <div className="relative min-w-0 overflow-hidden p-5">
        <div className="mb-1 grid grid-cols-8 gap-2 px-1" aria-label="사람과 AI의 작업 구간">
          <HandwrittenGroup tone="human">사람이 정함</HandwrittenGroup>
          <span className="col-span-4"><HandwrittenGroup tone="ai">AI가 이어서 작업</HandwrittenGroup></span>
          <HandwrittenGroup tone="human">사람이 확인</HandwrittenGroup>
          <span className="col-span-2"><HandwrittenGroup tone="ai">AI가 정리·출고</HandwrittenGroup></span>
        </div>
        <div className="relative z-10 grid grid-cols-8 gap-2">
          {STATIONS.map((station) => {
            const Icon = station.icon;
            const accent = station.owner === "human" ? HUMAN_ACCENT : AI_ACCENT;
            const isActive = world.live && active === station.id || station.id === "confirm" && waitingReviews > 0;
            const isSelected = selected === station.id;
            const selectedClass = station.owner === "human"
              ? "border-amber-200/60 bg-amber-300/[0.10] shadow-[inset_0_0_0_1px_rgba(252,211,77,.08),0_8px_24px_rgba(245,158,11,.07)]"
              : "border-cyan-200/55 bg-cyan-300/[0.09] shadow-[inset_0_0_0_1px_rgba(103,232,249,.08),0_8px_24px_rgba(34,211,238,.07)]";
            const idleClass = station.owner === "human"
              ? "border-amber-300/15 bg-[#121a27] hover:border-amber-200/35 hover:bg-amber-300/[0.035]"
              : "border-cyan-300/[0.08] bg-[#0d1727] hover:border-cyan-200/25 hover:bg-cyan-300/[0.025]";
            return <div key={station.id} className="relative min-w-0"><button type="button" onClick={() => setSelected(station.id)} className={`group flex min-h-[142px] w-full min-w-0 flex-col rounded-xl border px-3 py-3 text-left transition ${isSelected ? selectedClass : idleClass}`}>
              <span className="flex items-center justify-between gap-1"><span className="font-mono text-[9px] font-semibold" style={{ color: accent }}>{station.step}</span>{isActive && <span className={`h-1.5 w-1.5 rounded-full ck-pulse-dot ${station.owner === "human" ? "bg-amber-200" : "bg-cyan-200"}`} />}</span>
              <span className={`mt-5 flex h-10 w-10 items-center justify-center rounded-xl border ${station.owner === "human" ? "border-amber-300/20 bg-amber-300/[0.07]" : "border-cyan-300/15 bg-cyan-300/[0.055]"}`} style={{ color: accent }}><Icon size={20} strokeWidth={1.7} /></span>
              <strong className={`mt-3 line-clamp-2 min-h-8 text-[10px] leading-4 ${station.owner === "human" ? "text-amber-100" : "text-cyan-50"}`}>{station.label}</strong>
              <span className="mt-1 text-[9px] text-slate-500">{isActive ? "현재 작업 중" : station.id === "spec" && plannedSpecs > 0 ? `시작 전 ${plannedSpecs}개` : "대기"}</span>
            </button></div>;
          })}
        </div>

        <div className="pointer-events-none relative my-5 h-3" aria-hidden="true">
          <div className="absolute inset-x-[7%] top-1/2 h-px bg-gradient-to-r from-cyan-400/15 via-cyan-300/55 to-amber-300/35" />
          <span className="ck-work-route-dot absolute left-[7%] top-1/2 -ml-[5px] -mt-[5px] h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_16px_rgba(103,232,249,.95)]" />
        </div>

        <div className="grid grid-cols-[1.15fr_1fr_1fr] gap-3">
          <button type="button" onClick={() => navigate("/harness")} className="flex min-h-32 flex-col justify-start gap-3 rounded-xl border border-white/[0.08] bg-[var(--color-surface)] px-5 py-4 text-left hover:border-amber-300/30">
            <span className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300"><ClipboardCheck size={22} /></span><strong className="text-[16px] font-semibold tracking-[0.01em] text-amber-100">하네스 기준</strong></span>
            <span className="block text-[13.5px] leading-6 text-slate-300">오케스트레이터가 프로젝트 규칙을 읽고 각 담당의 검증 기준에 반영합니다.</span>
          </button>
          <button type="button" onClick={() => navigate("/sessions")} className="flex min-h-32 flex-col justify-start gap-3 rounded-xl border border-white/[0.08] bg-[var(--color-surface)] px-5 py-4 text-left hover:border-emerald-300/30">
            <span className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300"><Archive size={22} /></span><strong className="text-[16px] font-semibold tracking-[0.01em] text-emerald-100">도메인 현장</strong></span>
            <span className="block text-[13.5px] leading-6 text-slate-300">{domainCount}개 도메인의 작업과 배포 상태</span>
          </button>
          <button type="button" onClick={() => navigate("/weekly")} className="flex min-h-32 flex-col justify-start gap-3 rounded-xl border border-white/[0.08] bg-[var(--color-surface)] px-5 py-4 text-left hover:border-violet-300/30">
            <span className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-300/10 text-violet-300"><CheckCircle2 size={22} /></span><strong className="text-[16px] font-semibold tracking-[0.02em] text-violet-100">Weekly</strong></span>
            <span className="block text-[13.5px] leading-6 text-slate-300">이번 주 완료 결과 {completedThisWeek}건</span>
          </button>
        </div>
      </div>

      <aside className="flex min-h-[300px] flex-col border-l border-white/[0.07] bg-slate-950/45 p-4">
        <div className="flex items-center justify-between gap-2"><span className="font-mono text-[9px] font-semibold tracking-[0.15em]" style={{ color: focused.owner === "human" ? HUMAN_ACCENT : AI_ACCENT }}>{focused.step}</span><span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${focused.owner === "human" ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200" : "border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-200"}`}>{focused.role}</span></div>
        <h3 className="mt-2 text-[16px] font-semibold text-white">{focused.label}</h3>
        <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/15 p-3"><span className="text-[9px] text-slate-500">하는 일</span><p className="mt-2 text-[11px] leading-5 text-slate-200">{focused.work}</p></div>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><span className="text-[9px] text-slate-500">남기는 결과</span><p className="mt-2 text-[11px] leading-5 text-slate-300">{focused.output}</p></div>
        <p className="mt-auto border-t border-white/[0.06] pt-4 text-[10px] leading-5 text-slate-500">카드를 선택하면 각 단계가 맡는 일과 다음 단계에 넘기는 결과를 확인할 수 있습니다.</p>
      </aside>
    </div>
  </div>;
}
