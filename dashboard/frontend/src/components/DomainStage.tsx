import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardList, Code2, FlaskConical, GitCommitHorizontal, ShieldCheck, UserCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { stageHeadline, type StageTone } from "../lib/domainPulse.js";
import { resolveTaskTitle } from "../lib/taskTitle.js";
import { cn } from "../lib/utils.js";
import { FLOOR_STATIONS, selectFloorLanes, type FloorLane, type FloorStationId } from "../lib/workFloor.js";
import { relativeTime } from "./WorkFloor.js";

const STATION_ICONS: Record<FloorStationId, typeof ClipboardList> = {
  order: ClipboardList,
  code: Code2,
  test: FlaskConical,
  review: ShieldCheck,
  confirm: UserCheck,
  docs: BookOpen,
  commit: GitCommitHorizontal,
};

/** 상태별 색. 카드 테두리·배경 빛·현재 단계 노드가 같은 색을 쓴다. */
const TONE: Record<StageTone, { card: string; dot: string; text: string; node: string; halo: string }> = {
  waiting: { card: "border-violet-300/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(167,139,250,.16),transparent_55%)]", dot: "bg-violet-300", text: "text-violet-100", node: "border-violet-300/70 bg-violet-400/20 text-violet-100", halo: "bg-violet-400/40" },
  live: { card: "border-cyan-300/25 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(34,211,238,.13),transparent_55%)]", dot: "bg-cyan-300", text: "text-cyan-50", node: "border-cyan-300/70 bg-cyan-400/15 text-cyan-100", halo: "bg-cyan-400/40" },
  done: { card: "border-emerald-300/25 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(52,211,153,.13),transparent_55%)]", dot: "bg-emerald-300", text: "text-emerald-50", node: "border-emerald-300/60 bg-emerald-400/15 text-emerald-200", halo: "bg-emerald-400/30" },
  paused: { card: "border-amber-300/20 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(251,191,36,.09),transparent_55%)]", dot: "bg-amber-300", text: "text-amber-50", node: "border-amber-300/50 bg-amber-400/10 text-amber-200", halo: "" },
  rest: { card: "border-white/[0.08] bg-[radial-gradient(120%_140%_at_0%_0%,rgba(148,163,184,.07),transparent_55%)]", dot: "bg-slate-400", text: "text-slate-100", node: "border-slate-500/50 bg-slate-500/10 text-slate-300", halo: "" },
};

function Journey({ lane, tone }: { lane?: FloorLane; tone: StageTone }) {
  const state = lane?.state;
  const finished = tone === "rest" && state?.passed.length === FLOOR_STATIONS.length;
  return <ol className={cn("grid w-full grid-cols-7", finished && "opacity-70")} aria-label="작업 단계">
    {FLOOR_STATIONS.map((station, index) => {
      const Icon = STATION_ICONS[station.id];
      const passed = Boolean(state?.passed.includes(station.id));
      const current = !finished && state?.station === station.id && tone !== "rest";
      const myTurn = current && tone === "waiting";
      const reached = passed || current;
      return <li key={station.id} className="relative flex min-w-0 flex-col items-center" aria-current={current ? "step" : undefined}>
        {index > 0 && <span className={cn("absolute right-[calc(50%+24px)] top-[17px] h-[2px] w-[calc(100%-48px)] rounded-full transition-colors duration-500", reached ? "bg-emerald-400/50" : "bg-[repeating-linear-gradient(90deg,rgba(100,116,139,.45)_0_4px,transparent_4px_8px)]")} aria-hidden="true" />}
        <span className="flex min-w-0 flex-col items-center">
          <span className="relative flex h-9 w-9 items-center justify-center">
            {current && TONE[tone].halo && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 [animation-duration:2.2s]", TONE[tone].halo)} aria-hidden="true" />}
            <span className={cn("relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-500", current ? TONE[tone].node : passed ? "border-emerald-300/45 bg-emerald-400/[0.12] text-emerald-300" : "border-slate-700 bg-slate-900/80 text-slate-500")}>
              {passed && !current ? <Check size={16} strokeWidth={2.6} /> : <Icon size={16} strokeWidth={1.9} />}
            </span>
          </span>
          {myTurn
            ? <span className="mt-2 rounded-full bg-violet-300 px-2 py-0.5 text-[11px] font-bold text-violet-950">내 차례</span>
            : <span className={cn("mt-2 truncate text-[12px]", current ? cn("font-semibold", TONE[tone].text) : passed ? "text-emerald-200/70" : "text-slate-500")}>{station.label}</span>}
        </span>
      </li>;
    })}
  </ol>;
}

/**
 * 도메인 관리의 상태 카드. 선택한 도메인에서 지금 무슨 일이 있는지 한 문장으로 말하고,
 * 그 작업이 거친 단계를 여정으로 보여 준다. 여러 작업이 동시에 진행되면 카드 안에서 넘겨 본다.
 */
export function DomainStage({ workspace, selectedTaskKey, onSelectedTaskChange, attention, onOpenAttention, tools }: {
  workspace: string;
  selectedTaskKey: string | null;
  onSelectedTaskChange: (taskKey: string) => void;
  attention: { count: number; label: string | null };
  onOpenAttention: () => void;
  tools?: ReactNode;
}) {
  const all = useActivityStream(workspace);
  const { data: specs } = useSchedule();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const lanes = selectFloorLanes(all.filter((event) => event.workspace_name === workspace), now);
  const requested = selectedTaskKey ? lanes.findIndex((lane) => lane.key === selectedTaskKey) : -1;
  const index = requested >= 0 ? requested : 0;
  const lane = lanes[index];
  useEffect(() => { if (lane && lane.key !== selectedTaskKey) onSelectedTaskChange(lane.key); }, [lane, onSelectedTaskChange, selectedTaskKey]);

  const headline = stageHeadline(lane);
  const tone = TONE[headline.tone];
  const title = lane ? resolveTaskTitle({ workspace: lane.workspace, taskId: lane.taskId, projectPath: lane.projectPath, name: lane.name, at: lane.state.at }, specs ?? []) : null;
  const projectName = lane ? title?.project ?? lane.projectPath?.split(/[\\/]/).filter(Boolean).at(-1) ?? null : null;
  const move = (delta: number) => onSelectedTaskChange(lanes[(index + delta + lanes.length) % lanes.length].key);

  return <section className={cn("ck-stage-in rounded-2xl border px-5 py-4 transition-colors duration-500", tone.card)} aria-label={`${workspace} 상태`}>
    <div className="flex min-w-0 items-start gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {(headline.tone === "waiting" || headline.tone === "live") && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70", tone.dot)} aria-hidden="true" />}
            <span className={cn("relative h-2.5 w-2.5 rounded-full", tone.dot)} />
          </span>
          <strong className={cn("text-[17px] font-semibold tracking-[-0.01em]", tone.text)}>{headline.text}</strong>
        </p>
        {title && <p className="mt-1.5 truncate text-[14px] text-slate-200" title={title.title}>
          {projectName && <span className="mr-2 font-mono text-[12px] text-slate-400">{projectName}</span>}{title.title}
        </p>}
        <p className="mt-1 flex items-center gap-2 text-[12px] text-slate-500">
          <span className="font-mono">{workspace}</span>
          {lane?.state.at && <><span aria-hidden="true">·</span><span>{relativeTime(lane.state.at, now)}</span></>}
          {lanes.length > 1 && <span className="ml-1 flex items-center gap-1">
            <button type="button" aria-label="이전 작업" onClick={() => move(-1)} className="rounded-full p-0.5 text-slate-400 hover:bg-white/5 hover:text-slate-100"><ChevronLeft size={14} /></button>
            <span className="font-mono text-[11px]">{index + 1}/{lanes.length}</span>
            <button type="button" aria-label="다음 작업" onClick={() => move(1)} className="rounded-full p-0.5 text-slate-400 hover:bg-white/5 hover:text-slate-100"><ChevronRight size={14} /></button>
          </span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {attention.count > 0 && <button type="button" onClick={onOpenAttention} className="group inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3.5 py-1.5 text-[12.5px] font-bold text-amber-950 transition-transform active:scale-[0.97]">
          {attention.label ?? "확인 필요"} 확인하기<ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>}
        {tools}
      </div>
    </div>
    <div className="mt-5 border-t border-white/[0.06] pt-4">
      <Journey lane={lane} tone={headline.tone} />
    </div>
  </section>;
}
