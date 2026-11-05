import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardList, Code2, FlaskConical, GitCommitHorizontal, ShieldCheck, UserCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { apiJson } from "../api/client.js";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { attentionActionText, stageHeadline, type StageTone } from "../lib/domainPulse.js";
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
const TONE: Record<StageTone, { card: string; glow: string; dot: string; text: string; node: string; halo: string }> = {
  waiting: { card: "border-violet-300/30", glow: "rgba(167,139,250,.20)", dot: "bg-violet-300", text: "text-violet-100", node: "border-violet-300/70 bg-violet-400/20 text-violet-100", halo: "bg-violet-400/40" },
  live: { card: "border-cyan-300/25", glow: "rgba(34,211,238,.16)", dot: "bg-cyan-300", text: "text-cyan-50", node: "border-cyan-300/70 bg-cyan-400/15 text-cyan-100", halo: "bg-cyan-400/40" },
  done: { card: "border-emerald-300/25", glow: "rgba(52,211,153,.16)", dot: "bg-emerald-300", text: "text-emerald-50", node: "border-emerald-300/60 bg-emerald-400/15 text-emerald-200", halo: "bg-emerald-400/30" },
  paused: { card: "border-amber-300/20", glow: "rgba(251,191,36,.11)", dot: "bg-amber-300", text: "text-amber-50", node: "border-amber-300/50 bg-amber-400/10 text-amber-200", halo: "" },
  rest: { card: "border-cyan-200/[0.10]", glow: "rgba(45,212,191,.10)", dot: "bg-slate-400", text: "text-slate-100", node: "border-slate-500/50 bg-slate-500/10 text-slate-300", halo: "" },
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

/** 프로젝트 경로가 없는 예전 기록의 작업을 feature 폴더로 프로젝트에 잇는다. 찾지 못한 작업은 비워 둔다. */
function useTaskProjects(workspace: string, taskNames: readonly string[]): Readonly<Record<string, string>> {
  const [found, setFound] = useState<Record<string, string>>({});
  const key = taskNames.join(",");
  useEffect(() => {
    if (key === "") return;
    let cancelled = false;
    apiJson<{ projects: Record<string, string> }>(`/api/workspaces/${encodeURIComponent(workspace)}/task-projects?tasks=${encodeURIComponent(key)}`)
      .then((res) => { if (!cancelled) setFound(res.projects); })
      // 찾지 못하면 프로젝트명 없이 시각만 보여 준다. 카드의 다른 정보는 그대로 쓸 수 있다.
      .catch(() => { if (!cancelled) setFound({}); });
    return () => { cancelled = true; };
  }, [workspace, key]);
  return found;
}

/**
 * 도메인 관리의 상태 카드. 선택한 도메인에서 지금 무슨 일이 있는지 한 문장으로 말하고,
 * 그 작업이 거친 단계를 여정으로 보여 준다. 여러 작업이 동시에 진행되면 카드 안에서 넘겨 본다.
 */
export function DomainStage({ workspace, projectPaths, selectedTaskKey, onSelectedTaskChange, attention, onOpenAttention, tools }: {
  workspace: string;
  /** 도메인에 등록된 프로젝트 경로. 작업 기록에 프로젝트가 없을 때, 프로젝트가 하나뿐이면 그 이름을 쓴다. */
  projectPaths: readonly string[];
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
  const unresolved = useMemo(() => lanes.filter((item) => !item.projectPath).map((item) => item.name), [lanes]);
  const taskProjects = useTaskProjects(workspace, unresolved);
  const swipeStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const projectName = title?.project ?? (lane?.projectPath ? baseName(lane.projectPath) : lane && taskProjects[lane.name] ? baseName(taskProjects[lane.name]) : projectPaths.length === 1 ? baseName(projectPaths[0]) : null);
  const move = (delta: number) => onSelectedTaskChange(lanes[(index + delta + lanes.length) % lanes.length].key);
  const canSwitch = lanes.length > 1;
  const isInteractive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [role='button'], [data-no-lane-swipe]"));
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canSwitch || event.button !== 0 || isInteractive(event.target)) return;
    swipeStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    setDragOffset(Math.max(-24, Math.min(24, dx * 0.12)));
  };
  const finishSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    setDragOffset(0);
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.2) move(dx < 0 ? 1 : -1);
  };

  return <section
    className={cn("stage-card ck-stage-in relative rounded-2xl border px-5 py-4 transition-colors duration-500", canSwitch && "cursor-grab touch-pan-y select-none active:cursor-grabbing", tone.card)}
    style={{ "--stage-glow": tone.glow, translate: dragOffset === 0 ? undefined : `${dragOffset}px 0` } as CSSProperties}
    aria-label={`${workspace} 상태`}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finishSwipe}
    onPointerCancel={finishSwipe}
  >
    {canSwitch && <>
      <button type="button" data-no-lane-swipe aria-label="이전 작업장" onClick={() => move(-1)} className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/[0.08] bg-slate-950/75 p-1.5 text-slate-400 shadow-lg backdrop-blur transition hover:border-cyan-300/25 hover:bg-slate-900 hover:text-cyan-100 active:scale-95">
        <ChevronLeft size={17} />
      </button>
      <button type="button" data-no-lane-swipe aria-label="다음 작업장" onClick={() => move(1)} className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/[0.08] bg-slate-950/75 p-1.5 text-slate-400 shadow-lg backdrop-blur transition hover:border-cyan-300/25 hover:bg-slate-900 hover:text-cyan-100 active:scale-95">
        <ChevronRight size={17} />
      </button>
    </>}
    <div className="flex min-w-0 items-start gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {(headline.tone === "waiting" || headline.tone === "live") && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70", tone.dot)} aria-hidden="true" />}
            <span className={cn("relative h-2.5 w-2.5 rounded-full", tone.dot)} />
          </span>
          <strong className={cn("text-[17px] font-semibold tracking-[-0.01em]", tone.text)}>{headline.text}</strong>
        </p>
        {title && <p className="mt-1.5 truncate text-[14px] text-slate-200" title={title.title}>{title.title}</p>}
        {(projectName || lane?.state.at) && <p className="mt-1 flex items-center gap-2 text-[12px] text-slate-500">
          {projectName && <span className="font-mono">{projectName}</span>}
          {projectName && lane?.state.at && <span aria-hidden="true">·</span>}
          {lane?.state.at && <span>{relativeTime(lane.state.at, now)}</span>}
          {lanes.length > 1 && <span className="ml-1 font-mono text-[11px] text-slate-500">{index + 1}/{lanes.length}</span>}
        </p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {attention.count > 0 && <button type="button" onClick={onOpenAttention} className="group inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3.5 py-1.5 text-[12.5px] font-bold text-amber-950 transition-transform active:scale-[0.97]">
          {attentionActionText(headline.tone, attention.label)}<ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>}
        {tools}
      </div>
    </div>
    <div className="mt-5 border-t border-white/[0.06] pt-4">
      <Journey lane={lane} tone={headline.tone} />
    </div>
  </section>;
}
