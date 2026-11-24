import { ArrowRight, BookOpen, Check, ChevronDown, ClipboardList, Code2, FileText, FlaskConical, GitCommitHorizontal, ShieldCheck, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { apiJson } from "../api/client.js";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { selectDomainLanes, type DomainFloorLane, type DomainFloorSelection } from "../lib/domainFloor.js";
import { attentionActionText, stageHeadline, type StageTone } from "../lib/domainPulse.js";
import { resolveTaskTitle } from "../lib/taskTitle.js";
import { cn } from "../lib/utils.js";
import { FLOOR_STATIONS, type FloorStationId } from "../lib/workFloor.js";
import { relativeTime } from "./WorkFloor.js";

const SPEC_STATION = { id: "spec", label: "스펙 작성" } as const;
const STATION_ICONS: Record<FloorStationId | "spec", typeof ClipboardList> = {
  spec: FileText,
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

function Journey({ lane, tone, onOpenAttention }: { lane?: DomainFloorLane; tone: StageTone; onOpenAttention?: () => void }) {
  const state = lane?.state;
  const finished = tone === "rest" && state?.passed.length === FLOOR_STATIONS.length;
  const stations = lane?.spec ? [SPEC_STATION, ...FLOOR_STATIONS] : FLOOR_STATIONS;
  return <ol className={cn("grid w-full", lane?.spec ? "grid-cols-8" : "grid-cols-7", finished && "opacity-70")} aria-label="작업 단계">
    {stations.map((station, index) => {
      const Icon = STATION_ICONS[station.id];
      const passed = station.id === "spec" || Boolean(state?.passed.includes(station.id));
      const current = !finished && state?.station === station.id && tone !== "rest";
      const myTurn = current && tone === "waiting";
      const reached = passed || current;
      return <li key={station.id} className="relative flex min-w-0 flex-col items-center" aria-current={current ? "step" : undefined} aria-label={station.id === "spec" ? "스펙 작성 완료" : undefined}>
        {index > 0 && <span className={cn("absolute right-[calc(50%+24px)] top-[17px] h-[2px] w-[calc(100%-48px)] rounded-full transition-colors duration-500", reached ? "bg-emerald-400/50" : "bg-[repeating-linear-gradient(90deg,rgba(100,116,139,.45)_0_4px,transparent_4px_8px)]")} aria-hidden="true" />}
        {myTurn && onOpenAttention
          ? <button type="button" onClick={onOpenAttention} aria-label="사용자 확인 영역 열기" className="group flex min-w-0 flex-col items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-violet-100 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950">
              <span className="relative flex h-9 w-9 items-center justify-center transition-[transform,filter] duration-300 group-hover:scale-105 group-hover:drop-shadow-[0_0_10px_rgba(196,181,253,.65)] group-active:scale-[0.96]">
                {TONE[tone].halo && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 [animation-duration:2.2s]", TONE[tone].halo)} aria-hidden="true" />}
                <span className={cn("relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-500", TONE[tone].node)}>
                  <Icon size={16} strokeWidth={1.9} />
                </span>
              </span>
              <span className="mt-2 rounded-full bg-violet-300 px-2 py-0.5 text-[11px] font-bold text-violet-950 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 group-hover:shadow-[0_0_16px_rgba(196,181,253,.45)]">내 차례</span>
            </button>
          : <span className="flex min-w-0 flex-col items-center">
              <span className="relative flex h-9 w-9 items-center justify-center">
                {current && TONE[tone].halo && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 [animation-duration:2.2s]", TONE[tone].halo)} aria-hidden="true" />}
                <span className={cn("relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-500", current ? TONE[tone].node : passed ? "border-emerald-300/45 bg-emerald-400/[0.12] text-emerald-300" : "border-slate-700 bg-slate-900/80 text-slate-500")}>
                  {passed && !current ? <Check size={16} strokeWidth={2.6} /> : <Icon size={16} strokeWidth={1.9} />}
                </span>
              </span>
              <span className={cn("mt-2 truncate text-[12px]", current ? cn("font-semibold", TONE[tone].text) : passed ? "text-emerald-200/70" : "text-slate-500")}>{station.label}</span>
            </span>}
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
 * 그 작업이 거친 단계를 보여 준다. 작업이 여러 개면 제목으로 선택한다.
 */
export function DomainStage({ workspace, projectPaths, specs, selection, onSelectedTaskChange, attention, onOpenAttention, tools }: {
  workspace: string;
  /** 도메인에 등록된 프로젝트 경로. 작업 기록에 프로젝트가 없을 때, 프로젝트가 하나뿐이면 그 이름을 쓴다. */
  projectPaths: readonly string[];
  specs: readonly ScheduledSpec[];
  selection: DomainFloorSelection | null;
  onSelectedTaskChange: (selection: DomainFloorSelection) => void;
  attention: { count: number; label: string | null };
  onOpenAttention: () => void;
  tools?: ReactNode;
}) {
  const all = useActivityStream(workspace);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const lanes = useMemo(() => selectDomainLanes(all, specs, workspace, now), [all, specs, workspace, now]);
  const lane = lanes.find((item) => item.key === selection?.key) ?? lanes[0];
  useEffect(() => {
    if (lane && (lane.key !== selection?.key || lane.activityKey !== selection.activityKey)) {
      onSelectedTaskChange({ key: lane.key, activityKey: lane.activityKey });
    }
  }, [lane, onSelectedTaskChange, selection]);

  const headline = lane?.preparation === "ready" ? { tone: "rest" as const, text: "스펙 작성을 마쳤어요 · 작업 지시 대기" }
    : lane?.preparation === "starting" ? { tone: "rest" as const, text: "작업 활동 기록을 기다려요" } : stageHeadline(lane);
  const tone = TONE[headline.tone];
  const title = lane ? resolveTaskTitle({ workspace: lane.workspace, taskId: lane.taskId, specId: lane.spec?.id, projectPath: lane.projectPath, name: lane.name, at: lane.state.at }, lane.spec ? [lane.spec] : specs) : null;
  const unresolved = useMemo(() => lanes.filter((item) => !item.preparation && !item.projectPath).map((item) => item.name), [lanes]);
  const taskProjects = useTaskProjects(workspace, unresolved);
  const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const projectName = title?.project ?? (lane?.projectPath ? baseName(lane.projectPath) : lane && taskProjects[lane.name] ? baseName(taskProjects[lane.name]) : projectPaths.length === 1 ? baseName(projectPaths[0]) : null);

  return <section
    className={cn("stage-card ck-stage-in relative rounded-2xl border px-5 py-4 transition-colors duration-500", tone.card)}
    style={{ "--stage-glow": tone.glow } as CSSProperties}
    aria-label={`${workspace} 상태`}
  >
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {(headline.tone === "waiting" || headline.tone === "live") && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70", tone.dot)} aria-hidden="true" />}
            <span className={cn("relative h-2.5 w-2.5 rounded-full", tone.dot)} />
          </span>
          <strong className={cn("text-[17px] font-semibold tracking-[-0.01em]", tone.text)}>{headline.text}</strong>
        </p>
        {lanes.length > 1 ? <label className="mt-2 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 text-[12px] font-medium text-slate-400">작업 선택</span>
          <span className="relative min-w-0 max-w-full">
            <select value={lane?.key} onChange={(event) => {
              const next = lanes.find((item) => item.key === event.target.value);
              if (next) onSelectedTaskChange({ key: next.key, activityKey: next.activityKey });
            }} className="block max-w-full appearance-none truncate rounded-lg border border-cyan-300/20 bg-slate-950/70 py-1.5 pl-2.5 pr-7 text-[13px] font-medium text-slate-100 outline-none hover:border-cyan-300/40 focus-visible:ring-2 focus-visible:ring-cyan-300/70">
              {lanes.map((item) => <option key={item.key} value={item.key}>{item.spec?.title ?? item.name}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          </span>
        </label> : title && <p className="mt-1.5 truncate text-[14px] text-slate-200" title={title.title}>{title.title}</p>}
        {(projectName || lane?.state.at) && <p className="mt-1 flex items-center gap-2 text-[12px] text-slate-500">
          {projectName && <span className="font-mono">{projectName}</span>}
          {projectName && lane?.state.at && <span aria-hidden="true">·</span>}
          {lane?.state.at && <time dateTime={new Date(lane.state.at).toISOString()}>{lane.preparation === "ready" && "스펙 작성 "}{relativeTime(lane.state.at, now)}</time>}
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
      <Journey lane={lane} tone={headline.tone} onOpenAttention={onOpenAttention} />
    </div>
  </section>;
}
