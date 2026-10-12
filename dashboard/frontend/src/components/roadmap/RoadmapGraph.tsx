import { SpecDeploymentBadge } from "../SpecDeploymentBadge.js";
import { workflowStatus } from "../../lib/workflowStatus.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  Background,
  EdgeLabelRenderer,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useAuth } from "../../auth/AuthContext.js";
import { parseWorkResult, useRoadmap, type RoadmapNode, type WorkResultFile } from "../../hooks/useRoadmap.js";
import {
  assignRunToSpec,
  dropSubtree,
  renameRoadmapNode,
  restoreSubtree,
  unlinkRoadmapNodes,
  getReviewArtifact,
} from "../../api/roadmapMutationsApi.js";
import { SubtaskPanel } from "../SubtaskPanel.js";
import { SpecDocumentPanel } from "../SpecDocumentPanel.js";
import { cn } from "../../lib/utils.js";
import { shouldApplyHoverFocus } from "./interaction.js";
import { measuredLeafHeight, TASK_CARD_HEIGHT } from "./layoutSizing.js";
import { buildLineageChains, lineageSelection, type LineageChainItem } from "./lineageModel.js";
import { FileViewerSheet } from "./FileViewerSheet.js";
import { filesForRoadmapScope } from "./fileViewerModel.js";
import { taskGuidance } from "../../lib/taskGuidance.js";
import { focusPathIds, focusRootId } from "./focusPath.js";
import { presentSteKorean } from "../../lib/steKorean.js";

/** 설계안 치수 상수 — 그대로. */
const NODE_W = 236;
const WS_CARD_W = 560;
const CARD_H = TASK_CARD_HEIGHT;
const LINEAGE_VCARD_H = 72;
const ALERT = "#fb923c";
const C_READY = "#4fa87f";
const C_PROG = "#5c8bcc";
/**
 * 선택 표시색. **상태색과 무관한 별도 색**이어야 한다 — 상태 accent로 칠하면 대기 상태의
 * accent가 `#3a3f4d`(거의 배경색)이라 골라놓고도 골랐는지 알 수가 없다.
 * 앱의 나머지(워크스페이스 카드 `neon-border-cyan`)와 같은 시안 계열로 맞춘다.
 */
const SEL = "#22d3ee";
const selRing = (on: boolean) => (on ? `0 0 0 2px ${SEL}, 0 0 22px ${SEL}55` : undefined);
const CONT_HEADER = 54;
const CONT_PAD = 16;
const DROP_ROOM = 44;
/** 미분류 밴드(📋)가 차지하는 세로 폭 — 컨테이너 헤더 아래에 한 줄 더 얹힌다. */
const BAND_H = 30;
/** SPEC 안에서 RUN들이 가로로 늘어설 때의 간격(컨테이너 내부 dagre의 ranksep과 같은 값). */
const RUN_GAP = 80;
/** 설계안 stale 임계 — in_progress인 채 이만큼 지나면 경고를 띄운다(시간 단위). */
const STALE_WARN_H = 6;
const STALE_ALERT_H = 24;

/**
 * "진행중"이라고 적혀 있는데 실제로는 몇 시간째 아무 변화가 없는 노드를 잡아낸다.
 * 자기보고를 그대로 믿지 않는다는 이 프로젝트의 원칙이 화면에도 적용되는 자리다.
 * in_progress가 아니면 정체라는 개념 자체가 없으므로 보지 않는다.
 */
function staleHours(n: RoadmapNode): number | null {
  if (effStatus(n) !== "in_progress") return null;
  const t = n.updated_at ? Date.parse(n.updated_at) : NaN;
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}
/**
 * Spec에 편입되지 않은 RUN들을 담는 **가상 컨테이너**의 id.
 * 서버에 이런 노드는 없다 — 화면에서만 만든다. `assignRunToSpec(run, null)`로 분리한 RUN이
 * 최상위에 흩어져 "왜 여기 떠 있지"가 되는 걸 막고, 설계안의 📋미분류 밴드를 걸어준다.
 */
const UNASSIGNED = "__unassigned__";
/** 설계안 패치 체인 치수. */
const PC_COL_W = 280;
const PC_COL_GAP = 30;
const PC_CARD_GAP = 18;
/** 체인 노드 id 접두어 — 서버 노드가 아니라 여러 patch task를 묶은 화면 전용 노드다. */
const CHAIN = "chain:";

/**
 * `lineage` 컬럼은 계약상 `unknown`이다(스키마가 열려 있다). 화면이 쓰는 필드만 **방어적으로**
 * 읽는다 — 모양이 달라져도 체인이 통째로 사라지지 않고 depth 0 한 줄로 접힐 뿐이다.
 */
/** 체인 안의 카드 한 장. */
type ChainItem = LineageChainItem;

function effStatus(n: RoadmapNode): string {
  return workflowStatus(n);
}

/** 설계안 statusColor — ready(착수가능)가 in_progress보다 우선한다. */
function statusColor(status: string, ready: boolean): string {
  if (status === "verification") return "#fbbf24";
  if (status === "blocked") return ALERT;
  if (ready) return C_READY;
  if (status === "in_progress") return C_PROG;
  return ({ done: "#455c4d", dropped: "#2e323d", pending: "#464b5a" } as Record<string, string>)[status] ?? "#464b5a";
}

/** 설계안 cardStyle — 테두리/액센트/한글 라벨. */
function cardStyle(status: string, ready: boolean, isGroup: boolean) {
  if (isGroup) return { border: "#4b5261", accent: "#4b5261", label: "워크스트림" };
  if (status === "blocked") return { border: ALERT, accent: ALERT, label: "막힘" };
  if (ready) return { border: C_READY, accent: C_READY, label: "착수가능" };
  switch (status) {
    case "verification":
      return { border: "#d49c24", accent: "#fbbf24", label: "검증" };
    case "in_progress":
      return { border: C_PROG, accent: C_PROG, label: "진행중" };
    case "done":
      return { border: "#3f5a49", accent: "#5f8a6e", label: "완료" };
    case "dropped":
      return { border: "#2a2e38", accent: "#2a2e38", label: "취소" };
    default:
      return { border: "#3a3f4d", accent: "#3a3f4d", label: "대기" };
  }
}

type NodeData = {
  node: RoadmapNode;
  selected: boolean;
  ready: boolean;
  /** 직속 하위 개수(접혀서 안 보이는 것 포함) — 펼치기 전에 규모를 알아야 한다. */
  childCount?: number;
  /** 하위 중 done 개수. RUN 카드가 `· task N개 (M done)`으로 쓴다. */
  doneChildCount?: number;
  /** SPEC 헤더 뱃지 — 스스로 done인가 / 하위가 전부 끝나 완료 처리할 수 있는가. */
  specDone?: boolean;
  specCanComplete?: boolean;
  hasSummary?: boolean;
  onToggleExpand?: () => void;
  onViewSummary?: () => void;
  onViewSpec?: () => void;
  onRename?: () => void;
  /** 미분류 밴드의 밑줄 y좌표. null이면 밴드 없음(설계안). */
  bandBottom?: number | null;
  /**
   * 설계안 WorkstreamContainer의 "＋ 여기에 놓기" 표시.
   *
   * 캔버스는 §5.1대로 **읽기전용 뷰어**라 카드를 끌 수 없고, 따라서 이 값을 켜는 곳이 지금은
   * 없다. 마크업은 설계안에 있는 그대로 남겨둔다 — 나중에 캔버스 밖(목록 등)에서 끌어오는
   * 경로가 생기면 받을 자리가 이미 있는 셈이고, 지우면 스펙과 어긋난다.
   */
  isDropTarget?: boolean;
  /** lineage 노드 전용 — 이 체인에 묶인 patch 카드들(컬럼=sibling, 세로=serial). */
  chain?: ChainItem[][];
  /** 체인이 접혀 있는가(depth 0만 보인다). */
  collapsed?: boolean;
  /** in_progress인 채 흐른 시간(시간). null이면 정체 판정 대상 아님. */
  stale?: number | null;
  onSelect?: (id: string) => void;
  /** 체인 안에서 실제로 선택된 patch의 id — 체인 노드 자신의 id와는 다르다. */
  selectedItemId?: string | null;
};
type FlowNode = Node<NodeData, "roadmap" | "container" | "lineage">;

/**
 * nodeTypes ① — 접힌 **task 카드**와 접힌 **SPEC/RUN 폴더 카드**를 둘 다 그린다(설계안).
 *
 * 접힌 SPEC/RUN은 일반 task 카드가 아니라 **폴더**다: `WS_CARD_W` 폭 + 대시 테두리 + 헤더 밴드
 * + 펼치기 chevron. 접힌 폴더는 카드 전체가 제목 헤더이므로 **한 번 클릭하면 펼쳐진다**.
 */
function RoadmapNodeCard({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  const st = effStatus(n);
  const isSpec = n.level === "spec";
  const isGroup = isSpec || n.level === "workstream";
  const cs = cardStyle(st, data.ready, isGroup);
  const dim = st === "dropped";

  if (isGroup) {
    /**
     * chevron(▸)은 **펼치기만** 한다 — 전파를 막아 선택까지 바뀌지 않게.
     *
     * 카드 본체는 전파를 막지 않는다. 막으면 ReactFlow의 `onNodeClick`이 안 와서 이 노드가
     * 선택되지 않고, 그러면 오른쪽 패널이 안 열린다. **RUN의 Spec 편입/분리는 그 패널의
     * 드롭다운이 유일한 경로**(§C.3, 캔버스는 읽기전용)라, 여기서 전파를 막으면 기능 자체가
     * 손에 닿지 않게 된다.
     */
    const expandOnly = (e: React.MouseEvent) => {
      e.stopPropagation();
      data.onToggleExpand?.();
    };
    const expand = () => data.onToggleExpand?.();
    return (
      <div className="group/card" style={{ width: WS_CARD_W, opacity: dim ? 0.6 : 1 }}>
        <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
        <div
          className="cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all duration-150 group-hover/card:brightness-110"
          style={{
            borderColor: data.selected ? SEL : cs.border,
            background: data.selected ? "rgba(34,211,238,0.07)" : "rgba(30,41,59,0.35)",
            boxShadow: selRing(data.selected),
          }}
          title={isSpec ? "SPEC(마스터 PRD)" : "RUN(실행 묶음)"}
          onClick={expand}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap border-b border-slate-500/25 bg-slate-500/15 py-2.5 pl-2 pr-3">
            <button
              className="nodrag -my-1 flex h-8 w-8 items-center justify-center rounded text-[15px] leading-none text-slate-200 hover:bg-slate-400/20 hover:text-white"
              title="펼치기"
              onClick={expandOnly}
            >
              ▸
            </button>
            <span className={cn("leading-none opacity-80", isSpec ? "text-xl" : "text-base")}>{isSpec ? "📄" : "🔁"}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-md bg-slate-500/25 font-bold leading-none tracking-wider text-slate-200",
                isSpec ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
              )}
            >
              {isSpec ? "SPEC" : "RUN"}
            </span>
            {isSpec && <SpecDeploymentBadge deployment={n.deployment} title={n.title} />}
            <span className={cn("font-medium text-slate-400/90", isSpec ? "text-[13px]" : "text-[12px]")}>
              {isSpec
                ? `· RUN ${data.childCount ?? 0}개`
                : `· task ${data.childCount ?? 0}개 (${data.doneChildCount ?? 0} done)`}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-slate-200/90",
                isSpec ? "text-[15px] font-semibold" : "text-[13px]",
                dim && "line-through",
              )}
              title={n.title}
            >
              · {n.title}
            </span>
            {n.manual_status && <span className="shrink-0 text-[10px] text-amber-300">✋</span>}
          </div>
        </div>
        <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 9, height: 9, right: -5 }} />
      </div>
    );
  }

  /**
   * task 실행 카드 — 설계안 그대로.
   *
   * 상태 dot은 **깜빡이지 않는다.** `ck-pulse-dot`은 워크스페이스 카드·헤더 버전 뱃지·
   * "Polling 4s" 표시에만 쓰는 클래스다. 캔버스에 카드가 수십 장 깔린 화면에서 전부 깜빡이면
   * 눈이 어디를 봐야 할지 모르게 된다.
   */
  const total = data.childCount ?? 0;
  const done = data.doneChildCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  // stale 2(심각) = 테두리까지 ALERT로 바뀌고 "확인 필요", stale 1 = "정체 의심"(흐린 주황).
  const stale = data.stale == null ? 0 : data.stale >= STALE_ALERT_H ? 2 : 1;
  const guidance = taskGuidance(n);

  return (
    <div className="group/card" style={{ width: NODE_W, opacity: dim ? 0.55 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
      <div
        className="relative overflow-hidden rounded-xl border transition-all duration-150 group-hover/card:-translate-y-[2px] group-hover/card:brightness-110"
        style={{
          borderColor: data.selected ? SEL : stale === 2 ? ALERT : cs.border,
          background: st === "done" && stale === 0 ? "#1b2620" : "var(--color-surface)",
          boxShadow: selRing(data.selected),
        }}
      >
        {/* 상단 상태 색바 */}
        <div className="h-1" style={{ background: stale === 2 ? ALERT : cs.accent }} />
        <div className="px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: cs.accent, boxShadow: `0 0 4px ${cs.accent}66` }}
            />
            <div className="ml-auto flex items-center gap-1">
              {n.manual_status && (
                <span
                  className="rounded bg-sky-500/20 px-1 py-0.5 text-[8px] font-semibold text-sky-300"
                  title={`수동 완료(${n.manual_by ?? "사용자"}) — AI 완료 아님`}
                >
                  ✋ 수동
                </span>
              )}
              <span
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                style={{ background: `${cs.accent}22`, color: cs.accent }}
              >
                {cs.label}
              </span>
            </div>
          </div>

          <div
            className={cn("text-[12.5px] leading-snug text-slate-100", dim && "line-through")}
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 30 }}
            title={`${n.id} · ${n.title}`}
          >
            {n.title}
          </div>

          {total > 0 ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-background)]">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${pct}%`, background: cs.accent }}
                />
              </div>
              <span className="shrink-0 text-[12px] font-extrabold tabular-nums" style={{ color: cs.accent }}>
                {done}
                <span className="font-bold text-[var(--color-text-muted)]">/{total}</span>
              </span>
            </div>
          ) : (
            <div className="mt-1.5 text-[9px] text-[var(--color-text-muted)]">subtask 없음</div>
          )}

          {guidance.kind !== "done" && <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-1.5 text-[9.5px] leading-tight">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[var(--color-text-dim)]">현재</span>
              <span className={cn("truncate font-semibold", guidance.kind === "blocked" ? "text-orange-300" : (guidance.kind === "attention" || guidance.kind === "verification") ? "text-amber-300" : "text-slate-300")}>
                {guidance.currentStage}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[var(--color-text-dim)]">다음</span>
              <span className="truncate text-cyan-300/85">{guidance.nextAction}</span>
            </div>
            {(guidance.kind === "blocked" || (guidance.kind === "attention" || guidance.kind === "verification")) && (
              <div className="truncate text-orange-300/75" title={guidance.reason}>⚠ {guidance.reason}</div>
            )}
          </div>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 9, height: 9, right: -5 }} />
    </div>
  );
}

/** nodeTypes ②: 펼친 SPEC/RUN 컨테이너 — 대시 테두리 + 헤더 밴드. */
function WorkstreamContainer({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  const isSpec = n.level === "spec";
  const isBand = n.id === UNASSIGNED;
  const st = effStatus(n);
  const dim = st === "dropped";
  return (
    // 부모(ReactFlow 노드)가 style.width/height로 실제 크기를 준다 — 자식이 이 안에 놓이므로
    // 여기서 폭을 고정하면 안 된다.
    <div className="relative h-full w-full" style={{ opacity: dim ? 0.6 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
      <div
        className="h-full w-full rounded-xl border-2 border-dashed transition-all duration-150"
        style={{
          borderColor: data.isDropTarget
            ? "rgba(52,211,153,0.85)"
            : data.selected
              ? SEL
              : isBand
                ? "rgba(251,191,36,0.55)"
                : "#4b5261",
          background: data.isDropTarget
            ? "rgba(16,185,129,0.10)"
            : data.selected
              ? "rgba(34,211,238,0.06)"
              : "rgba(30,41,59,0.35)",
          boxShadow: selRing(!!data.selected),
        }}
        title={isBand ? "어느 Spec에도 편입되지 않은 RUN" : isSpec ? "SPEC(마스터 PRD)" : "RUN(실행 묶음)"}
      >
        {/* 설계안 미분류 밴드 */}
        {data.bandBottom != null && (
          <>
            <div
              className="pointer-events-none absolute flex items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[12px] font-extrabold tracking-[0.12em] text-slate-900"
              style={{ left: CONT_PAD, top: CONT_HEADER + 4 }}
            >
              <span className="text-[9px] leading-none">📋</span>미분류
            </div>
            <div
              className="pointer-events-none absolute border-t-2 border-amber-400/70"
              style={{ left: CONT_PAD, right: CONT_PAD, top: data.bandBottom }}
            />
          </>
        )}
        {/* 설계안 drop 타깃 */}
        {data.isDropTarget && (
          <div
            className="pointer-events-none absolute inset-x-3 flex items-end justify-center pb-2"
            style={{ top: CONT_HEADER, bottom: 0 }}
          >
            <span className="rounded-md border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-1 text-[12px] font-bold text-emerald-200 shadow">
              ＋ 여기에 놓기
            </span>
          </div>
        )}
        <div
          className="nodrag flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b border-slate-500/25 bg-slate-500/15 py-2.5 pl-2 pr-3 transition-colors hover:bg-cyan-400/10"
          title={isBand ? undefined : `${isSpec ? "SPEC" : "RUN"} 접기`}
          onClick={(e) => {
            if (isBand) return;
            e.stopPropagation();
            data.onToggleExpand?.();
          }}
        >
          {isBand ? (
            // 미분류는 접히지 않는다 — 접어서 안 보이면 "편입 안 된 RUN이 있다"는 사실을 잊는다.
            <span className="-my-1 flex h-8 w-8 items-center justify-center text-[15px] leading-none text-amber-300/70">▾</span>
          ) : (
          <button
            className="nodrag -my-1 flex h-8 w-8 items-center justify-center rounded text-[15px] leading-none text-slate-200 hover:bg-slate-400/20 hover:text-white"
            title="접기"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleExpand?.();
            }}
          >
            ▾
          </button>
          )}
          <span className={cn("leading-none opacity-80", isSpec ? "text-xl" : "text-base")}>
            {isBand ? "📋" : isSpec ? "📄" : "🔁"}
          </span>
          <span className="rounded-md bg-slate-500/25 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-200">
            {isBand ? "미분류" : isSpec ? "SPEC" : "RUN"}
          </span>
          {isSpec && <SpecDeploymentBadge deployment={n.deployment} title={n.title} />}
          <span
            className={cn("min-w-0 flex-1 truncate text-slate-200/90", isSpec ? "text-[15px] font-semibold" : "text-[13px]")}
            title={n.title}
          >
            {isBand ? "· 어느 Spec에도 편입되지 않은 RUN — 카드를 눌러 오른쪽 패널에서 편입하세요" : `· ${n.title}`}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-slate-400">
            {isSpec ? `RUN ${data.childCount ?? 0}개` : `task ${data.childCount ?? 0}개 (${data.doneChildCount ?? 0} done)`}
          </span>

          {/* 설계안 헤더 우측 액션. SPEC 전용 뱃지/버튼은 SPEC에서만 뜬다. */}
          <div className="nodrag ml-auto flex shrink-0 items-center gap-2">
            {st === "verification" && <span className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-300">검증</span>}
            {isSpec && data.specDone && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[12px] font-bold text-emerald-300">
                ✅ 작업완료
              </span>
            )}
            {isSpec && !data.specDone && data.specCanComplete && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-400/30 bg-slate-500/15 px-1.5 py-0.5 text-[12px] font-semibold text-slate-300"
                title="하위 작업이 전부 끝났습니다 — 패널에서 완료 처리할 수 있어요"
              >
                ☑ 완료 가능
              </span>
            )}
            {isSpec && data.hasSummary && (
              <button
                className="rounded border border-violet-500/40 px-1 py-0.5 text-[12px] text-violet-300/90 hover:bg-violet-500/10 hover:text-violet-200"
                title="이 SPEC의 AI 작업요약 보기"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onViewSummary?.();
                }}
              >
                🧠 AI요약
              </button>
            )}
            {isSpec && n.spec_path && (
              <button
                className="rounded border border-sky-500/40 px-1 py-0.5 text-[12px] text-sky-300/90 hover:bg-sky-500/10 hover:text-sky-200"
                title="Spec 원문(PRD) 보기"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onViewSpec?.();
                }}
              >
                📄 원문
              </button>
            )}
            {/* 가상 미분류 컨테이너는 서버에 없는 id다 — 이름을 바꾸면 404다. 아예 안 그린다. */}
            {!isBand && (
              <button
                className="text-[12px] text-slate-300/80 hover:text-slate-100"
                title="이름 변경"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onRename?.();
                }}
              >
                ✎
              </button>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 9, height: 9, right: -5 }} />
    </div>
  );
}

/**
 * nodeTypes ③: patch 계보 체인(설계안).
 *
 * 카드 한 장이 아니라 **체인 하나가 노드 하나**다. 같은 컬럼 안의 버전 카드 사이만 violet
 * 점선으로 잇는다 — v0 위에는 연결 대상이 없으므로 stem을 그리지 않는다.
 * 접으면 각 컬럼의 depth 0 한 장만 남고 "▾ +N패치" 버튼이 붙는다.
 */
function LineageChainNode({ data }: NodeProps<FlowNode>) {
  const cols = data.chain ?? [];
  const isColl = data.collapsed !== false;
  const ncols = Math.max(cols.length, 1);
  const totalW = ncols * PC_COL_W + (ncols - 1) * PC_COL_GAP;
  // "최신"은 **차수가 가장 높은 한 장**이다. 컬럼마다 붙이면 최신이 여러 개가 돼 의미가 없다.
  const latestKey = cols.flat().reduce<ChainItem | null>((a, b) => (!a || b.version > a.version ? b : a), null)?.key;

  return (
    <div className="relative" style={{ width: totalW }}>
      <Handle type="target" position={Position.Left} style={{ top: 16, opacity: 0 }} />
      <div className="flex" style={{ gap: PC_COL_GAP }}>
        {cols.map((col) => {
          const shown = isColl ? col.slice(0, 1) : col;
          const hasChildren = col.length > 1;
          return (
            <div key={col[0].key} className="flex flex-col" style={{ width: PC_COL_W, gap: PC_CARD_GAP }}>
              {shown.map((item, ri) => {
                const st = effStatus(item.node);
                const isFeat = item.version === 0;
                const cs = cardStyle(st, false, false);
                return (
                  <div key={item.key} className="relative">
                    {/* 같은 컬럼의 앞 카드와 잇는 세로 점선 = 연속 차수 */}
                    {ri > 0 && (
                      <div
                        className="absolute border-l-2 border-dashed"
                        style={{ left: "50%", top: -PC_CARD_GAP, height: PC_CARD_GAP, borderColor: "#8B5CF6", opacity: 0.7 }}
                      />
                    )}
                    <div
                      className={cn(
                        "cursor-pointer overflow-hidden rounded-xl border transition-all hover:-translate-y-[2px] hover:brightness-110",
                        isFeat ? "bg-[var(--color-surface)]" : "bg-violet-500/10 px-2.5 py-2",
                      )}
                      style={{
                        height: LINEAGE_VCARD_H,
                        borderColor: data.selectedItemId === item.key ? SEL : isFeat ? cs.border : "rgba(139,92,246,0.5)",
                        background: isFeat && st === "done" ? "#1b2620" : undefined,
                        boxShadow: selRing(data.selectedItemId === item.key),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onSelect?.(item.key);
                      }}
                    >
                      {isFeat ? (
                        <>
                          <div className="h-1" style={{ background: cs.accent }} />
                          <div className="px-2.5 py-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: cs.accent, boxShadow: `0 0 4px ${cs.accent}66` }}
                              />
                              <span
                                className="ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                                style={{ background: `${cs.accent}22`, color: cs.accent }}
                              >
                                {cs.label}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-[12.5px] leading-snug text-slate-100" title={item.title}>
                              {item.title}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 rounded bg-violet-500/25 px-1.5 py-0.5 font-mono text-[12px] font-bold text-violet-100">
                              v{item.version}-patch
                            </span>
                            {item.key === latestKey && (
                              <span className="shrink-0 font-mono text-[10px] text-violet-300/80">최신</span>
                            )}
                            <span
                              className="ml-auto shrink-0 font-mono text-[10px] uppercase"
                              style={{ color: statusColor(st, false) }}
                            >
                              {st === "done" ? "완료" : cs.label}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[12.5px] text-[var(--color-text)]" title={item.title}>
                            🔁 {item.title}
                          </div>
                        </>
                      )}
                    </div>
                    {ri === 0 && hasChildren && (
                      <button
                        className="nodrag absolute z-10 flex items-center gap-1 rounded-full border border-violet-400/40 bg-[var(--color-surface)] px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-violet-300 hover:bg-violet-500/15"
                        style={{ left: "50%", bottom: -9, transform: "translateX(-50%)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          data.onToggleExpand?.();
                        }}
                      >
                        {isColl ? `▾ +${col.length - 1}패치` : "▴ 접기"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <Handle type="source" position={Position.Right} style={{ top: "auto", bottom: LINEAGE_VCARD_H / 2, opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { roadmap: RoadmapNodeCard, container: WorkstreamContainer, lineage: LineageChainNode };

/**
 * edgeTypes ①: 지울 수 있는 의존 엣지(설계안 `DeletableEdge`).
 *
 * `depends_on`(순서)은 §7에서 **대시보드 소유**로 못박은 컬럼이다. 소유한다는 건 사람이
 * 여기서 고친다는 뜻인데, 지금까지 화면에 지우는 수단이 없어서 한 번 들어온 링크는
 * 플러그인을 거치지 않고는 뺄 수가 없었다.
 *
 * 라벨은 hover에만 띄운다. 항상 띄우면 엣지가 많은 그래프에서 ✕가 노드를 다 가린다.
 */
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const d = data as
    | { onDelete?: (edgeId: string) => void; dim?: boolean; hi?: boolean; keep?: () => void; release?: () => void }
    | undefined;
  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {/*
        SVG `foreignObject`에 직접 넣으면 안 된다 — ReactFlow의 `.react-flow__edge`는
        `pointer-events: visibleStroke`라 선 위가 아닌 자식은 클릭이 통째로 무시된다.
        `EdgeLabelRenderer`는 라벨을 SVG 밖 오버레이 div로 포탈해 그 문제를 피한다.
      */}
      {/*
        ✕는 **이 엣지에 마우스를 올렸을 때만 존재한다(`hi`)**.

        `opacity: 0`으로 숨겨두면 안 된다 — 라벨 레이어는 노드 위(z-index 12)에 있어서, 보이지도
        않는 22px 버튼이 그 자리에 있는 카드의 클릭을 통째로 가로챈다. 렌더 자체를 막아야 한다.

        판정을 `dim`으로 하면 안 되는 이유도 있다. ✕는 엣지 한가운데, 즉 컨테이너 **안**에 뜨기
        때문에 마우스를 가져가는 순간 그 컨테이너에 포커스가 걸려 버튼이 사라진다.
      */}
      {d?.onDelete && d.hi && (
        <EdgeLabelRenderer>
          <button
            title="이 의존을 지웁니다"
            // 이 버튼은 노드 **위**에 뜬다. 손을 올리는 순간 노드에서 마우스가 빠져 포커스가
            // 꺼지고 버튼이 사라지는데, 그러면 다시 노드 위가 되어 버튼이 돌아온다 —
            // 깜빡임이 무한히 반복된다. 버튼에 올라와 있는 동안은 포커스를 붙잡아 둔다.
            onMouseEnter={() => d.keep?.()}
            onMouseLeave={() => d.release?.()}
            onClick={(e) => {
              e.stopPropagation();
              d.onDelete!(id);
            }}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
            className="nodrag nopan absolute flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] leading-none text-[var(--color-text-dim)] shadow hover:border-rose-400/60 hover:text-rose-300"
          >
            ✕
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

/**
 * **의존(`depends_on`)은 task ↔ task 전용이다** — 플러그인 스펙 §"링크 타입"의 `task → task`,
 * 백엔드 `LINK_REQUIRES_TASK_LEVEL`과 같은 계약이다. RUN/SPEC 사이의 순서는 의존이 아니라
 * **포함(parent)** 으로 표현한다. 아무 레벨에나 링크를 그리면 "RUN이 RUN을 기다린다"는,
 * 온톨로지에 없는 관계가 화면에만 생겨난다.
 */
function isDepNode(n: RoadmapNode): boolean {
  return n.level === "task" && !n.id.startsWith(CHAIN);
}

/** to가 전부 done이어야 from이 착수가능. 미지의 의존은 not-done으로 본다(안전측). */
function computeReady(nodes: RoadmapNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ready = new Set<string>();
  for (const n of nodes) {
    const st = effStatus(n);
    // 착수가능(ready) 판정도 task만 — RUN/SPEC에 초록 "착수가능"이 뜨면 눌러서 시작할 게 있는
    // 것처럼 보이지만, 실제로 시작되는 건 그 안의 task다.
    if (!isDepNode(n) || st !== "pending") continue;
    const deps = n.depends_on ?? [];
    if (deps.every((d) => effStatus(byId.get(d) ?? ({ status: "pending" } as RoadmapNode)) === "done")) ready.add(n.id);
  }
  return ready;
}

/**
 * 그래프에 올릴 노드를 고른다.
 *
 * **subtask(REQ)는 그래프에 올리지 않는다(설계안).** nodeTypes는 roadmap(접힌 task/SPEC·RUN
 * 카드) / container(펼친 SPEC·RUN) / lineage(패치 체인) 셋뿐이고, REQ는 노드가 아니라
 * **오른쪽 SubtaskPanel의 "진행 N/M" 탭**에 들어간다. REQ까지 카드로 뿌리면 task 하나에
 * 카드가 3~5개씩 붙어 위상 그래프가 아니라 목록이 된다.
 *
 * 접힌 컨테이너(SPEC/RUN)의 자손은 숨긴다 — 더블클릭으로 펼쳐야 드러난다.
 */
function visibleNodes(nodes: RoadmapNode[], expanded: Set<string>): RoadmapNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isContainer = (n: RoadmapNode) => n.level === "spec" || n.level === "workstream";

  const hiddenByCollapsedAncestor = (n: RoadmapNode): boolean => {
    let cur = n.parent ? byId.get(n.parent) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (isContainer(cur) && !expanded.has(cur.id)) return true;
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return false;
  };

  return nodes.filter((n) => n.level !== "subtask" && n.level !== "step" && !hiddenByCollapsedAncestor(n));
}

function layout(
  nodes: RoadmapNode[],
  selectedId: string | null,
  expanded: Set<string>,
  onToggleExpand: (id: string) => void,
  actions: {
    onViewSummary: (n: RoadmapNode) => void;
    onViewSpec: (n: RoadmapNode) => void;
    onRename: (n: RoadmapNode) => void;
    onSelect: (id: string) => void;
  },
): { rfNodes: FlowNode[]; rfEdges: Edge[] } {
  const ready = computeReady(nodes);
  // 하위 개수는 **숨긴 것까지 세어** 접힌 카드에 "N 하위"로 보여준다(펼치기 전에 규모를 알아야 한다).
  const childCount = new Map<string, number>();
  const doneChildCount = new Map<string, number>();
  for (const n of nodes) {
    if (!n.parent) continue;
    childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
    if (effStatus(n) === "done") doneChildCount.set(n.parent, (doneChildCount.get(n.parent) ?? 0) + 1);
  }
  nodes = visibleNodes(nodes, expanded);

  // 펼친 SPEC/RUN만 container(대시 테두리 컨테이너). 접혀 있으면 폴더 카드로 그린다.
  const kindOf = (n: RoadmapNode): "roadmap" | "container" | "lineage" => {
    if (n.id.startsWith(CHAIN)) return "lineage";
    if (n.level === "spec" || n.level === "workstream") return expanded.has(n.id) ? "container" : "roadmap";
    return "roadmap";
  };

  /** 체인 노드의 크기 — 컬럼 수 × 폭, 높이는 가장 긴 컬럼 기준(접혀 있으면 한 장). */
  const chainSize = (id: string) => {
    const cols = chainCols.get(id) ?? [];
    const ncols = Math.max(cols.length, 1);
    const rows = Math.max(...cols.map((c) => (expanded.has(id) ? c.length : 1)), 1);
    return {
      w: ncols * PC_COL_W + (ncols - 1) * PC_COL_GAP,
      h: rows * LINEAGE_VCARD_H + (rows - 1) * PC_CARD_GAP,
    };
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string, RoadmapNode[]>();
  const roots: RoadmapNode[] = [];
  for (const n of nodes) {
    if (n.parent && byId.has(n.parent)) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
    else roots.push(n);
  }

  /**
   * **패치 체인 묶기(설계안).** `lineage`가 붙은 patch task들은 카드를 낱장으로 흩뿌리지 않고
   * 계보 하나당 노드 하나(`chain:<root>`)로 묶는다 — 3차 패치까지 간 작업이 카드 네 장으로
   * 퍼지면 원본이 어느 것인지 안 보인다.
   *
   * 컬럼은 스펙 그대로 **depth 0마다 새로 열고, depth>0은 직전 컬럼에 세로로 쌓는다.**
   */
  const chainCols = new Map<string, ChainItem[][]>();
  /** 체인 노드에 흡수돼 더 이상 낱개로 그려지지 않는 patch task들 — 엣지도 걸면 안 된다. */
  const absorbed = new Set<string>();
  const lineageChains = buildLineageChains(nodes);
  if (lineageChains.length > 0) {
    for (const chain of lineageChains) {
      const { id, root, parent, memberIds, columns } = chain;
      chainCols.set(id, columns);

      // 원본 노드들을 빼고 체인 노드 한 개로 갈아끼운다. 소속(부모 RUN)은 첫 멤버를 따른다 —
      // patch는 새 Run을 만들지 않고 **원본 Run에 귀속**되기 때문이다(플러그인 스펙 §성숙).
      const first = columns[0][0].node;
      const chainNode = { id, title: root, level: "task", status: effStatus(first), parent, lineage: {} } as RoadmapNode;
      byId.set(id, chainNode);
      const memberIdSet = new Set(memberIds);
      for (const memberId of memberIds) absorbed.add(memberId);
      const strip = (arr: RoadmapNode[]) => arr.filter((n) => !memberIdSet.has(n.id));
      if (parent && kids.has(parent)) kids.set(parent, [...strip(kids.get(parent)!), chainNode]);
      else roots.splice(0, roots.length, ...strip(roots), chainNode);
    }
  }

  /**
   * **미분류 밴드(설계안).** Spec이 하나라도 있는 로드맵에서 부모 없는 RUN은 "아직 어느 Spec에도
   * 안 걸린 것"이라는 뜻이다 — 최상위에 그냥 흩뿌리면 Spec 컨테이너와 구분이 안 간다. 그래서
   * 가상 컨테이너 하나로 묶고 📋미분류 밴드를 얹는다.
   *
   * Spec이 아예 없는 로드맵에는 만들지 않는다. 그런 데선 "미분류"라는 말 자체가 성립하지 않는다.
   */
  const hasSpec = nodes.some((n) => n.level === "spec");
  const loose = roots.filter((n) => n.level === "workstream");
  let bandNode: RoadmapNode | null = null;
  if (hasSpec && loose.length > 0) {
    bandNode = { id: UNASSIGNED, title: "미분류", level: "spec", status: "pending" } as RoadmapNode;
    kids.set(UNASSIGNED, loose);
    const looseIds = new Set(loose.map((n) => n.id));
    roots.splice(0, roots.length, ...roots.filter((n) => !looseIds.has(n.id)), bandNode);
    byId.set(UNASSIGNED, bandNode);
    childCount.set(UNASSIGNED, loose.length);
    doneChildCount.set(UNASSIGNED, loose.filter((n) => effStatus(n) === "done").length);
    expanded = new Set([...expanded, UNASSIGNED]); // 미분류는 접지 않는다 — 접으면 존재를 잊는다.
  }

  /** 컨테이너 안쪽 내용이 시작하는 y — 미분류만 밴드 높이만큼 더 내려간다. */
  const innerTop = (id: string) => CONT_HEADER + (id === UNASSIGNED ? BAND_H : 0);

  /**
   * **2단 레이아웃(설계안).** 펼친 컨테이너는 자식을 *옆에 늘어놓는 게 아니라 품는다* —
   * ReactFlow의 `parentId`로 실제 부모-자식이 되고, 자식 좌표는 부모 기준 상대좌표다.
   *
   * 그래서 안쪽부터 재귀로 크기를 정한다: 자식들을 컨테이너 내부 dagre(nodesep 24·ranksep 80)로
   * 배치해 bbox를 얻고, 그 bbox에 헤더(CONT_HEADER)·여백(CONT_PAD)·드롭 여유(DROP_ROOM)를 더한
   * 값이 컨테이너의 크기가 된다. 이 크기를 가지고 다시 바깥 단계를 배치한다.
   *
   * 안쪽 크기를 모르면 바깥 dagre가 컨테이너를 실제보다 작게 잡아 형제 노드와 겹친다 —
   * 그래서 순서가 뒤집히면 안 된다.
   */
  /**
   * 사람이 옮겨 저장한 자리. MySQL DECIMAL은 드라이버가 문자열로 준다 → Number()로 통일한다.
   */
  const savedPos = (n: RoadmapNode): { x: number; y: number } | null =>
    n.pos_x !== null && n.pos_x !== undefined && n.pos_y !== null && n.pos_y !== undefined
      ? { x: Number(n.pos_x), y: Number(n.pos_y) }
      : null;

  const size = new Map<string, { w: number; h: number }>();
  const childPos = new Map<string, { x: number; y: number }>();

  const measure = (n: RoadmapNode): { w: number; h: number } => {
    const cached = size.get(n.id);
    if (cached) return cached;
    const kind = kindOf(n);

    if (kind !== "container") {
      const s =
        kind === "lineage"
          ? chainSize(n.id)
          : n.level === "spec" || n.level === "workstream"
            ? { w: WS_CARD_W, h: CONT_HEADER } // 접힌 폴더 = 헤더 밴드 한 줄
            : { w: NODE_W, h: measuredLeafHeight(n.level) };
      size.set(n.id, s);
      return s;
    }

    const children = kids.get(n.id) ?? [];
    if (children.length === 0) {
      const s = { w: WS_CARD_W, h: innerTop(n.id) + CONT_PAD * 2 };
      size.set(n.id, s);
      return s;
    }

    /**
     * **SPEC 안의 RUN은 가로 한 줄로 왼→오른쪽으로 흐른다.** RUN은 feat 하나당 하나씩 생기는
     * *작업흐름의 단계*라서, 진행 방향이 곧 가로 방향이다.
     *
     * dagre에 맡기면 안 된다. RUN끼리는 의존(`depends_on`)이 없으므로 — 있어서도 안 된다,
     * 의존은 task↔task뿐이다 — LR dagre가 전부 같은 rank 0에 넣어 **세로로 쌓아버린다.**
     * 엣지가 없는 그래프에서 dagre가 줄 수 있는 정보가 없으니, 순서는 우리가 정한다:
     * 서버가 준 로드맵 배열 순서(=생성 순서)가 곧 작업 순서다.
     */
    if (n.level === "spec") {
      let x = CONT_PAD;
      let rowH = 0;
      for (const c of children) {
        const cs = measure(c);
        const sp = savedPos(c);
        const pos = sp ?? { x, y: innerTop(n.id) + CONT_PAD };
        childPos.set(c.id, pos);
        x = Math.max(x, pos.x) + cs.w + RUN_GAP;
        rowH = Math.max(rowH, pos.y - innerTop(n.id) - CONT_PAD + cs.h);
      }
      const s = {
        w: Math.max(WS_CARD_W, x - RUN_GAP + CONT_PAD),
        h: innerTop(n.id) + CONT_PAD + rowH + CONT_PAD + DROP_ROOM,
      };
      size.set(n.id, s);
      return s;
    }

    const inner = new dagre.graphlib.Graph();
    inner.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 80, marginx: 0, marginy: 0 });
    inner.setDefaultEdgeLabel(() => ({}));
    for (const c of children) {
      const cs = measure(c);
      inner.setNode(c.id, { width: cs.w, height: cs.h });
    }
    const childIds = new Set(children.map((c) => c.id));
    for (const c of children) {
      if (!isDepNode(c)) continue;
      for (const dep of c.depends_on ?? []) if (childIds.has(dep) && isDepNode(byId.get(dep)!)) inner.setEdge(dep, c.id);
    }
    dagre.layout(inner);

    let maxX = 0;
    let maxY = 0;
    for (const c of children) {
      const p = inner.node(c.id);
      const cs = size.get(c.id)!;
      // dagre는 중심 좌표를 준다 → 좌상단으로 변환하고 컨테이너 안쪽 여백만큼 민다.
      // **사람이 옮긴 자리가 있으면 그게 이긴다.** 이걸 bbox 계산에 같이 넣어야 컨테이너가
      // 옮긴 카드를 따라 커진다 — 안 그러면 `extent:\"parent\"`가 상자 밖 좌표를 잘라내서
      // 저장은 됐는데 화면은 안 움직이는, 가장 헷갈리는 실패가 난다.
      const sp = savedPos(c);
      const x = sp ? sp.x : (p?.x ?? 0) - cs.w / 2 + CONT_PAD;
      const y = sp ? sp.y : (p?.y ?? 0) - cs.h / 2 + innerTop(n.id) + CONT_PAD;
      childPos.set(c.id, { x, y });
      maxX = Math.max(maxX, x + cs.w);
      maxY = Math.max(maxY, y + cs.h);
    }

    const s = { w: Math.max(WS_CARD_W, maxX + CONT_PAD), h: maxY + CONT_PAD + DROP_ROOM };
    size.set(n.id, s);
    return s;
  };

  for (const r of roots) measure(r);

  // 최상위 산개(설계안) — 컨테이너는 위에서 잰 실제 크기로 자리를 잡는다.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 44, ranksep: 150, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const r of roots) {
    const s = size.get(r.id)!;
    g.setNode(r.id, { width: s.w, height: s.h });
  }
  const rootIds = new Set(roots.map((r) => r.id));
  for (const r of roots) {
    if (!isDepNode(r)) continue;
    for (const dep of r.depends_on ?? []) if (rootIds.has(dep) && isDepNode(byId.get(dep)!)) g.setEdge(dep, r.id);
  }
  dagre.layout(g);

  // 엣지는 컨테이너를 넘나들며 그리되, **task ↔ task만** 그린다(위 isDepNode 주석 참조).
  const ids = new Set(nodes.map((n) => n.id));
  const rfEdges: Edge[] = [];
  for (const n of nodes) {
    if (!isDepNode(n) || absorbed.has(n.id)) continue;
    for (const dep of n.depends_on ?? []) {
      if (!ids.has(dep) || absorbed.has(dep) || !isDepNode(byId.get(dep)!)) continue;
      // id는 `선행->후행`. 지울 때 이 id를 그대로 갈라 unlink(후행, 선행)으로 되돌린다.
      rfEdges.push({
        id: `${dep}->${n.id}`,
        source: dep,
        target: n.id,
        type: "deletable",
        // `animated`(점선 행진)는 스펙의 캔버스 엣지에 없다. 켜두면 진행중 의존선이 계속
        // 꿈틀거려, 정작 봐야 할 상태 변화가 그 움직임에 묻힌다.
        style: { stroke: "rgba(148,163,184,0.45)" },
      });
    }
  }

  // ReactFlow는 **부모가 배열에서 자식보다 먼저** 와야 한다 — 위에서 아래로 훑어 담는다.
  const rfNodes: FlowNode[] = [];
  const emit = (n: RoadmapNode, parentId?: string) => {
    const kind = kindOf(n);
    const s = size.get(n.id)!;
    const rootPos = g.node(n.id);
    // **사람이 옮긴 자리(pos_x/pos_y)가 dagre를 이긴다.** §7에서 pos는 대시보드 소유다 —
    // 자동배치가 매번 덮어쓰면 "옮겼다"는 행위에 아무 의미가 없다. 가상 노드(체인·미분류)는
    // 서버에 없으니 저장된 좌표도 없다.
    // 자식은 measure가 이미 저장 자리를 반영해 childPos에 넣어뒀다(컨테이너 크기와 한 몸).
    // 최상위는 여기서 직접 본다.
    const position = parentId
      ? (childPos.get(n.id) ?? { x: 0, y: 0 })
      : (savedPos(n) ?? { x: (rootPos?.x ?? 0) - s.w / 2, y: (rootPos?.y ?? 0) - s.h / 2 });

    rfNodes.push({
      id: n.id,
      type: kind,
      position,
      ...(parentId ? { parentId, extent: "parent" as const } : {}),
      style: { width: s.w, height: s.h },
      data: {
        node: n,
        selected: selectedId === n.id,
        ready: ready.has(n.id),
        childCount: childCount.get(n.id) ?? 0,
        doneChildCount: doneChildCount.get(n.id) ?? 0,
        specDone: effStatus(n) === "done",
        // "완료 가능" = 자기는 아직 안 끝났는데 하위는 전부 끝난 상태. 사람이 닫아주기만 하면 된다.
        specCanComplete: (childCount.get(n.id) ?? 0) > 0 && childCount.get(n.id) === doneChildCount.get(n.id),
        hasSummary: !!parseWorkResult(n.work_result)?.summary,
        onToggleExpand: () => onToggleExpand(n.id),
        onViewSummary: () => actions.onViewSummary(n),
        onViewSpec: () => actions.onViewSpec(n),
        onRename: () => actions.onRename(n),
        bandBottom: n.id === UNASSIGNED ? CONT_HEADER + BAND_H - 4 : null,
        stale: (() => {
          const h = staleHours(n);
          return h != null && h >= STALE_WARN_H ? h : null;
        })(),
        chain: chainCols.get(n.id),
        selectedItemId: selectedId,
        collapsed: !expanded.has(n.id),
        onSelect: actions.onSelect,
      },
    });

    if (kind === "container") for (const c of kids.get(n.id) ?? []) emit(c, n.id);
  };
  for (const r of roots) emit(r);

  return { rfNodes, rfEdges };
}


interface MenuState {
  x: number;
  y: number;
  node: RoadmapNode;
}

/**
 * 설계안 `RoadmapGraph` — **읽기전용 DAG 뷰어.** 전체화면 페이지(`/roadmap/:workspace`)와
 * Sessions의 Agent Canvas 오버레이 모달이 **같은 컴포넌트를 공유한다**(설계안이 오버레이
 * 본문으로 `<RoadmapGraph fill />`을 그대로 쓴다).
 *
 * 두 자리에 각각 다른 뷰를 두면 "캔버스"라는 말이 화면마다 다른 걸 가리키게 되고, 폐기/편입
 * 같은 조작이 한쪽에만 붙는다.
 *
 * `fill`이면 부모 높이를 채운다(모달·페이지 둘 다 flex 컨테이너 안에 들어간다).
 */
export function RoadmapGraph({
  workspace,
  fill = false,
  onEdited,
  nodeFilter,
  focusNodeId,
  onFileViewerChange,
}: {
  workspace: string;
  fill?: boolean;
  /** RoadmapTab의 "진행 중심" 결과. 주면 이 목록만 그린다(폴링은 계속 전체를 읽는다). */
  nodeFilter?: RoadmapNode[];
  onEdited?: () => void;
  /** §7B Schedule 탭 딥링크(`/roadmap/:workspace?focus=`). 로드된 뒤 그 노드로 팬 + 선택하고
   * 1회만 적용한다(이후 폴링 갱신에서 다시 튀지 않게 `focusedOnce`로 잠근다). */
  focusNodeId?: string;
  onFileViewerChange?: (open: boolean) => void;
}) {
  const { userId } = useAuth();
  const { data, loading, error, refetch } = useRoadmap(workspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ReactFlowProvider 하위(RoadmapGraphPanel이 감쌈)라 onInit/ref 없이 바로 인스턴스를 쓸 수 있다.
  const rf = useReactFlow<FlowNode>();
  const [focusedOnce, setFocusedOnce] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 펼친 SPEC/RUN/lineage 집합. SPEC은 기본 펼침, lineage는 RUN을 열었을 때 계보가 곧바로
   * 보이도록 기본 펼침이다. RUN 자체는 접어서 첫 화면의 최상위 구조를 유지한다. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  /** 폴링으로 늦게 도착한 lineage도 최초 한 번은 펼친다. 사용자가 접은 체인은 다시 열지 않는다. */
  const [knownChains, setKnownChains] = useState<Set<string>>(new Set());
  /** 헤더 액션 팝업: 🧠 AI요약 / 📄 원문 / ✎ 이름변경. */
  const [summaryOf, setSummaryOf] = useState<RoadmapNode | null>(null);
  const [specDocumentTarget, setSpecDocumentTarget] = useState<RoadmapNode | null>(null);
  const [renaming, setRenaming] = useState<{ node: RoadmapNode; value: string } | null>(null);

  // 필터가 오면 그 목록을 쓴다. 단 **폴링 결과와 어긋나지 않게** id로 다시 맞춘다 —
  // 필터는 부모가 4초 전에 계산한 것이라, 그 사이 바뀐 상태를 그대로 들고 있을 수 있다.
  const nodes = useMemo(() => {
    const all = data ?? [];
    if (!nodeFilter) return all;
    const allow = new Set(nodeFilter.map((n) => n.id));
    return all.filter((n) => allow.has(n.id));
  }, [data, nodeFilter]);

  useEffect(() => {
    if (seeded || nodes.length === 0) return;
    setExpanded(
      new Set([
        ...nodes.filter((n) => n.level === "spec").map((n) => n.id),
        ...buildLineageChains(nodes).map((chain) => chain.id),
      ]),
    );
    setSeeded(true);
  }, [nodes, seeded]);

  // Schedule의 명시적 "Canvas에서 보기"는 정확한 Task와 그 부모 RUN/SPEC을 펼친다.
  useEffect(() => {
    if (!focusNodeId || focusedOnce) return;
    const target = nodes.find((n) => n.id === focusNodeId);
    if (!target) return;
    const path = focusPathIds(nodes, focusNodeId);
    setExpanded((prev) => new Set([...prev, ...path]));
    setSelectedId(focusNodeId);
  }, [focusNodeId, focusedOnce, nodes]);

  useEffect(() => {
    const ids = buildLineageChains(nodes).map((chain) => chain.id);
    const fresh = ids.filter((id) => !knownChains.has(id));
    if (fresh.length === 0) return;
    setExpanded((prev) => new Set([...prev, ...fresh]));
    setKnownChains((prev) => new Set([...prev, ...fresh]));
  }, [nodes, knownChains]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const actions = useMemo(
    () => ({
      onViewSummary: (n: RoadmapNode) => setSummaryOf(n),
      // Schedule과 같은 node-id 기반 뷰어를 쓴다. 제목으로 ADR을 찾던 구식 경로는
      // spec_path에 연결된 실제 파일과 어긋나므로 Canvas에서 사용하지 않는다.
      onViewSpec: (n: RoadmapNode) => setSpecDocumentTarget(n),
      onRename: (n: RoadmapNode) => setRenaming({ node: n, value: n.title }),
      onSelect: (id: string) => {
        setFileViewer(null);
        setSelectedId((cur) => (cur === id ? null : id));
      },
    }),
    [userId, workspace],
  );

  const [hovered, setHovered] = useState<string | null>(null);
  /**
   * 포커스 해제에 **유예를 둔다.** 엣지의 ✕는 노드 위에 뜨기 때문에, 손을 올리는 순간
   * 노드에서 마우스가 빠져 포커스가 꺼지고 버튼이 사라진다 → 다시 노드 위가 되어 버튼이
   * 돌아온다. 유예가 없으면 이 왕복이 무한히 반복돼 화면이 깜빡인다.
   */
  const hoverTimer = useRef<number | null>(null);
  const keepHover = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);
  const holdHover = useCallback(
    (id: string | null) => {
      keepHover();
      if (id !== null) {
        setHovered(id);
        return;
      }
      hoverTimer.current = window.setTimeout(() => setHovered(null), 260);
    },
    [keepHover],
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const [fileViewer, setFileViewer] = useState<{ file: WorkResultFile; expanded: boolean } | null>(null);
  useEffect(() => {
    onFileViewerChange?.(Boolean(fileViewer));
    return () => onFileViewerChange?.(false);
  }, [Boolean(fileViewer), onFileViewerChange]);
  /** SPEC 단위 필터. 노드를 지우는 게 아니라 **어느 SPEC 묶음을 보여줄지**만 고른다. */
  const [specFilter, setSpecFilter] = useState<"all" | "active" | "done">("all");

  /**
   * SPEC 필터 — 해당 SPEC과 **그 자손 전부**를 함께 남긴다. SPEC만 남기면 빈 상자가 되고,
   * 자손만 남기면 부모를 잃은 카드가 최상위로 튄다. SPEC에 안 걸린 노드(미분류 등)는
   * 어느 필터에서도 사라지지 않는다 — 필터로 가려서 잊게 만들면 안 되는 것들이다.
   */
  const shown = useMemo(() => {
    if (specFilter === "all") return nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const specOf = (n: RoadmapNode): RoadmapNode | null => {
      let cur: RoadmapNode | undefined = n;
      while (cur) {
        if (cur.level === "spec") return cur;
        cur = cur.parent ? byId.get(cur.parent) : undefined;
      }
      return null;
    };
    return nodes.filter((n) => {
      const spec = specOf(n);
      if (!spec) return true;
      const done = effStatus(spec) === "done";
      return specFilter === "done" ? done : !done;
    });
  }, [nodes, specFilter]);

  const base = useMemo(
    () => layout(shown, selectedId, expanded, toggleExpand, actions),
    [shown, selectedId, expanded, toggleExpand, actions],
  );

  /**
   * **포커스 모드(설계안).** 노드에 마우스를 올리면 그 노드와 **직접 이어진 것들만** 남기고
   * 나머지를 흐린다. 엣지가 컨테이너를 넘나드는 그래프에서, 이 줄이 어디서 어디로 가는지
   * 눈으로 따라가는 건 사실상 불가능하다.
   *
   * 계보(조상/자손)까지 전부 밝히면 결국 그래프 절반이 켜져 아무것도 안 흐려진다 —
   * **1촌(직접 의존·피의존)과 포함관계 부모**로만 한정한다.
   */
  const focus = useMemo(() => {
    if (focusNodeId && nodes.some((node) => node.id === focusNodeId)) {
      const rootId = focusRootId(nodes, focusNodeId);
      const nodeSet = new Set<string>();
      if (rootId) {
        nodeSet.add(rootId);
        const stack = [rootId];
        while (stack.length) {
          const parent = stack.pop()!;
          for (const node of base.rfNodes) {
            if (node.parentId !== parent || nodeSet.has(node.id)) continue;
            nodeSet.add(node.id);
            stack.push(node.id);
          }
        }
      }
      const edgeSet = new Set(base.rfEdges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target)).map((edge) => edge.id));
      return { nodeSet, edgeSet };
    }
    if (!shouldApplyHoverFocus(hovered, selectedId)) return null;
    const nodeSet = new Set<string>([hovered!]);
    for (const e of base.rfEdges) {
      if (e.source !== hovered && e.target !== hovered) continue;
      nodeSet.add(e.source);
      nodeSet.add(e.target);
    }
    const byId = new Map(base.rfNodes.map((n) => [n.id, n]));

    // 상자에 마우스를 올렸으면 **그 안의 것들은 같이 밝다.** 자기 자식을 흐리게 만들면
    // 상자를 가리켰는데 내용이 사라지는, 아무도 원하지 않는 동작이 된다.
    const kidsOf = new Map<string, string[]>();
    for (const n of base.rfNodes) {
      if (!n.parentId) continue;
      kidsOf.set(n.parentId, [...(kidsOf.get(n.parentId) ?? []), n.id]);
    }
    const stack = [...nodeSet];
    while (stack.length) {
      const id = stack.pop()!;
      for (const k of kidsOf.get(id) ?? []) {
        if (nodeSet.has(k)) continue;
        nodeSet.add(k);
        stack.push(k);
      }
    }

    // 흐려진 상자 안에 밝은 카드가 들어앉으면 카드까지 같이 어두워 보인다 → 조상도 살린다.
    for (const id of [...nodeSet]) {
      let cur = byId.get(id)?.parentId;
      while (cur) {
        nodeSet.add(cur);
        cur = byId.get(cur)?.parentId;
      }
    }
    /**
     * 엣지는 **nodeSet이 다 정해진 뒤에** 고른다. 상자에 마우스를 올렸을 때 그 안의 의존선까지
     * 켜져야 ✕에 손이 닿는다 — 엣지 자체에는 hover를 걸 수 없다(컨테이너 노드가 선을 덮는다).
     */
    const edgeSet = new Set<string>();
    for (const e of base.rfEdges) {
      if (nodeSet.has(e.source) && nodeSet.has(e.target)) edgeSet.add(e.id);
    }
    return { nodeSet, edgeSet };
  }, [focusNodeId, nodes, hovered, selectedId, base.rfNodes, base.rfEdges]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
      } finally {
        // 성공이든 실패든 서버 상태를 다시 읽는다 — 낙관적 갱신을 하지 않으므로
        // 화면이 실제와 어긋난 채 남는 경우가 없다.
        refetch();
        onEdited?.();
        setBusy(false);
        setMenu(null);
      }
    },
    [refetch, onEdited],
  );

  const onDeleteEdge = useCallback(
    (edgeId: string) => {
      // id는 `선행->후행`. 백엔드 unlink(from, to)는 `from.dependsOn -= to`라 순서를 뒤집는다.
      const [to, from] = edgeId.split("->");
      if (!to || !from) return;
      void run(() => unlinkRoadmapNodes(userId!, workspace, from, to));
    },
    [run, userId, workspace],
  );

  const rfEdges = useMemo(
    () =>
      base.rfEdges.map((e) => {
        const on = focus ? focus.edgeSet.has(e.id) : true;
        return {
          ...e,
          zIndex: focus && on ? 900 : undefined,
          style: { ...e.style, opacity: focus && !on ? 0.1 : 0.8 },
          // hi(설계안) = 지금 포커스된 묶음에 속한 엣지. ✕는 여기에만 뜬다.
          data: {
            ...e.data,
            onDelete: onDeleteEdge,
            dim: focus ? !on : false,
            hi: focus ? on : false,
            keep: keepHover,
            release: () => holdHover(null),
          },
        };
      }),
    [base.rfEdges, focus, onDeleteEdge, keepHover, holdHover],
  );

  /**
   * 노드는 ReactFlow가 들고 있고, **레이아웃이 실제로 달라졌을 때만** 다시 심는다.
   *
   * 판단 기준이 `layoutSig`다 — 위치·크기·부모 + 화면에 그려지는 데이터만 담는다. 4초 폴링이
   * 같은 내용을 다시 가져왔다면 문자열이 같으므로 아무 일도 일어나지 않는다. 이 가드가 없으면
   * 폴링마다 전체 레이아웃이 다시 계산되고 노드가 통째로 다시 그려진다.
   */
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>([]);

  const layoutSig = useMemo(
    () =>
      base.rfNodes
        .map((n) => {
          const d = n.data;
          // stale은 실수(시간)라 매 렌더 값이 미세하게 바뀐다 → 그대로 넣으면 서명이 늘 달라져
          // 매 렌더 재배치가 돈다. 화면에 보이는 **구간**으로만 접는다.
          const staleBucket = d.stale == null ? "" : d.stale >= STALE_ALERT_H ? "a" : "w";
          return [
            n.id,
            n.type,
            Math.round(n.position.x),
            Math.round(n.position.y),
            n.style?.width,
            n.style?.height,
            n.parentId ?? "",
            effStatus(d.node),
            d.ready ? 1 : 0,
            d.selected ? 1 : 0,
            d.childCount,
            d.doneChildCount,
            d.collapsed ? 1 : 0,
            staleBucket,
          ].join(",");
        })
        .join("|"),
    [base.rfNodes],
  );

  useEffect(() => {
    setFlowNodes(base.rfNodes);
    // base.rfNodes는 매 렌더 새 배열이라 의존성에 넣으면 무한 재심기다 — 서명으로만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSig, setFlowNodes]);

  useEffect(() => {
    if (!focusNodeId || focusedOnce) return;
    const rootId = focusRootId(nodes, focusNodeId);
    const rootNode = rootId ? flowNodes.find((node) => node.id === rootId) : null;
    if (!rootNode || rootNode.type !== "container" || rootNode.data.collapsed) return;
    let nextFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => {
        const width = typeof rootNode.measured?.width === "number" ? rootNode.measured.width : Number(rootNode.style?.width) || 560;
        const height = typeof rootNode.measured?.height === "number" ? rootNode.measured.height : Number(rootNode.style?.height) || 400;
        rf.setCenter(rootNode.position.x + width / 2, rootNode.position.y + height / 2, { zoom: 0.95, duration: 400 });
        setFocusedOnce(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nextFrame);
    };
  }, [focusNodeId, focusedOnce, flowNodes, nodes, rf]);

  /**
   * 포커스 흐림·드롭 타깃은 **위치를 건드리지 않는** 덧칠이라 렌더 시점에 얹는다.
   * 여기서 `position`을 손대면 드래그와 다시 싸우게 된다.
   */
  const rfNodes = useMemo(() => {
    return flowNodes.map((n) => {
      // Selection is visual state, independent of the chain's unchanged layout.
      const rendered = { ...n, data: { ...n.data, selected: selectedId === n.id, selectedItemId: selectedId } };
      if (!focus || focus.nodeSet.has(n.id)) return rendered;
      return { ...rendered, style: { ...n.style, opacity: 0.12 } };
    });
  }, [flowNodes, focus, selectedId]);

  /** 설계안 droppedTop — dropped인데 부모는 dropped가 아닌 "최상위 폐기"만. */
  const droppedTop = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const isDropped = (n?: RoadmapNode) => !!n && effStatus(n) === "dropped";
    return nodes.filter((n) => isDropped(n) && !isDropped(n.parent ? byId.get(n.parent) : undefined));
  }, [nodes]);

  // 메뉴/폐기함은 여기서 Esc를 잡아 전파를 멈춘다. 안 그러면 메뉴만 닫으려 했는데
  // 바깥 모달의 Esc 핸들러까지 같이 발동해 캔버스 전체가 닫힌다.
  useEffect(() => {
    if (!menu && !binOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (menu) setMenu(null);
      else setBinOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu, binOpen]);


  const selectedLineageItem = useMemo(
    () => buildLineageChains(nodes).flatMap((chain) => chain.columns.flat()).find((item) => item.key === selectedId) ?? null,
    [nodes, selectedId],
  );
  const selectedLineage = useMemo(() => {
    if (!selectedLineageItem) return null;
    return lineageSelection(selectedLineageItem);
  }, [selectedLineageItem]);
  const selectedNode = selectedLineage?.node ?? nodes.find((n) => n.id === selectedId) ?? null;
  const selectedReqs = selectedLineage
    ? selectedLineage.requirementsUnavailable && selectedLineageItem?.node.status !== "done"
      ? nodes.filter((n) => n.parent === selectedLineageItem?.node.id && n.level === "subtask")
      : selectedLineage.reqs
    : selectedNode ? nodes.filter((n) => n.parent === selectedNode.id && n.level === "subtask") : [];
  const selectedFiles = useMemo(
    // 진행 중심/SPEC 상태 필터는 **캔버스 표시만** 줄인다. 상세 범위까지 잘라버리면
    // 화면에서 숨긴 완료 TASK의 산출물이 SPEC 파일 탭에서 사라진다.
    () => selectedNode ? filesForRoadmapScope(selectedNode, data ?? nodes) : [],
    [selectedNode, data, nodes],
  );
  const selectViewerFile = useCallback(async (file: WorkResultFile) => {
    if (file.content || file.diff || file.unavailableReason || !userId || !selectedNode) {
      setFileViewer((current) => ({ file, expanded: current?.expanded ?? true }));
      return;
    }
    const workResult = parseWorkResult(selectedNode.work_result);
    const loaded = await getReviewArtifact(userId, workspace, {
      taskId: selectedNode.ref ?? selectedNode.id.replace(/:v\d+$/, ""),
      path: file.path,
      sessionId: selectedNode.human_blocker?.sessionId,
      patchVersion: workResult?.patchVersion,
    });
    setFileViewer((current) => ({ file: loaded, expanded: current?.expanded ?? true }));
  }, [selectedNode, userId, workspace]);
  const specs = nodes.filter((n) => n.level === "spec");

  if (loading && nodes.length === 0) {
    return (
      <div className={cn("flex items-center justify-center", fill ? "h-full" : "h-64")}>
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn("flex items-center justify-center p-6 text-[13px] text-rose-300", fill && "h-full")}>
        로드맵을 불러오지 못했습니다: {error}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0",
        fill ? "h-full" : "h-[70vh]",
      )}
    >
      <div className="group/rf relative min-w-0 flex-1">
        {/* 설계안 좌상단 — ℹ️ 가이드 */}
        <button
          onClick={() => setGuideOpen((v) => !v)}
          className="absolute left-3 top-3 z-30 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-cyan-400/50 hover:text-cyan-300"
          title="캔버스에서 뭘 할 수 있는지"
        >
          {guideOpen ? "✕ 닫기" : "ℹ️ 가이드"}
        </button>
        {guideOpen && (
          <div className="absolute left-3 top-14 z-30 w-[330px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[12px] leading-relaxed text-[var(--color-text-muted)] shadow-xl">
            <p className="mb-1.5 font-semibold text-[var(--color-text-bright)]">이 캔버스에서 할 수 있는 것</p>
            <ul className="space-y-1">
              <li>· SPEC/RUN은 <b>상단 제목 헤더</b>를 클릭할 때만 접히고 펼쳐집니다.</li>
              <li>· TASK 카드를 클릭하면 오른쪽에 상세가 열립니다.</li>
              <li>· 배치는 <b>자동</b>입니다 — 카드를 끌어 옮기지 않습니다(빈 곳을 끌면 화면이 움직입니다).</li>
              <li>· RUN의 <b>Spec 편입·분리</b>는 오른쪽 패널의 드롭다운에서 합니다.</li>
              <li>· RUN/SPEC <b>우클릭</b>으로 폐기하고, 우상단 폐기함에서 되돌립니다.</li>
              <li>· 노드에 마우스를 올리면 <b>연결된 것만</b> 밝아지고, 의존선에 ✕가 뜹니다.</li>
              <li>· REQ는 그래프가 아니라 <b>오른쪽 패널</b>에서 봅니다.</li>
            </ul>
          </div>
        )}

        {/* 우상단 — SPEC 필터 세그먼트 + 폐기함. 콘솔 크기는 콘솔 헤더에서 조절한다. */}
        <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            {(["all", "active", "done"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSpecFilter(k)}
                className={cn(
                  "px-2.5 py-1.5 text-xs transition-colors",
                  specFilter === k
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
                title="SPEC 단위로 걸러 봅니다"
              >
                {k === "all" ? "전체" : k === "active" ? "진행중" : "완료"}
              </button>
            ))}
          </div>
          {droppedTop.length > 0 && (
            <button
              onClick={() => setBinOpen(true)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-rose-400/50 hover:text-rose-300"
              title="폐기함 — 버린 항목 보기/복구"
            >
              🗑️ 폐기함 {droppedTop.length}
            </button>
          )}
        </div>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onInit={(inst) => {
            if (!focusNodeId) inst.fitView({ padding: 0.18, maxZoom: 1 });
          }}
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
          edgeTypes={edgeTypes}
          /**
           * **읽기전용 뷰어(§5.1).** 설계안이 명시적으로 이렇게 못박는다:
           * `nodesFocusable/nodesConnectable/nodesDraggable/elementsSelectable = false`.
           *
           * 캔버스는 **보는 자리**다. 구조를 바꾸는 일은 각각 제자리가 따로 있다 —
           * RUN의 Spec 편입/분리는 오른쪽 패널의 드롭다운, 폐기·복구는 우클릭 메뉴와 폐기함,
           * 의존 삭제는 엣지의 ✕. 여기서 카드를 끌어 옮기는 조작은 스펙에 없다.
           */
          nodesFocusable={false}
          nodesConnectable={false}
          nodesDraggable={false}
          connectionRadius={40}
          elevateEdgesOnSelect
          elementsSelectable={false}
          deleteKeyCode={null}
          panOnDrag={[0, 1, 2]}
          zoomOnDoubleClick={false}
          // 드래그용이 아니라 **크기 측정 변화**를 받기 위한 것이다(설계안에 그대로 있다).
          onNodesChange={onNodesChange}
          onNodeMouseEnter={(_, node) => holdHover(node.id)}
          onNodeMouseLeave={() => holdHover(null)}
          onNodeClick={(_, node) => {
            setHovered(null);
            setFileViewer(null);
            setSelectedId(node.id === selectedId ? null : node.id);
          }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            const n = nodes.find((x) => x.id === node.id);
            // 설계안: 우클릭 메뉴는 RUN/SPEC에서만(task는 잠금 대상).
            if (!n || (n.level !== "workstream" && n.level !== "spec")) return;
            setMenu({ x: e.clientX, y: e.clientY, node: n });
          }}
          onPaneClick={() => setMenu(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#1e293b" />
          <Controls className="canvas-controls" showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(nd) => {
              const n = nodes.find((x) => x.id === nd.id);
              return n ? statusColor(effStatus(n), false) : "#464b5a";
            }}
            style={{ background: "var(--color-surface)" }}
          />
        </ReactFlow>
      </div>

      {selectedNode && (
        <div className="ck-scroll w-[30%] shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)]">
          <SubtaskPanel
            workspace={workspace}
            node={selectedNode}
            requirementsUnavailable={!!selectedLineage?.requirementsUnavailable && selectedReqs.length === 0}
            reqs={selectedReqs}
            children={nodes.filter((n) => n.parent === selectedNode.id && n.level !== "subtask" && n.level !== "step")}
            onClose={() => {
              setFileViewer(null);
              setSelectedId(null);
            }}
            onOpenFile={(file, expanded = false) => setFileViewer({ file, expanded })}
            scopeFiles={selectedFiles}
            onChanged={() => {
              refetch();
              onEdited?.();
            }}
          />
          {/* 설계안 SubtaskPanel — RUN Spec 편입/분리. RUN에서만 뜬다. */}
          {selectedNode.level === "workstream" && (
            <div className="mt-3 rounded-lg border border-[var(--color-border)] p-2.5">
              <div className="mb-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">Spec 편입 / 분리</div>
              <select
                value={selectedNode.parent ?? ""}
                disabled={busy}
                onChange={(e) => run(() => assignRunToSpec(userId!, workspace, selectedNode.id, e.target.value || null))}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)]"
              >
                <option value="">— 미분류(분리) —</option>
                {specs.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.title}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[10.5px] text-[var(--color-text-dim)]">
                task와 달리 RUN은 다른 Spec으로 다시 옮길 수 있습니다.
              </p>
            </div>
          )}
        </div>
      )}

      {fileViewer && (
        <FileViewerSheet
          file={fileViewer.file}
          files={selectedFiles}
          expanded={fileViewer.expanded}
          onSelectFile={selectViewerFile}
          onExpandedChange={(expanded) => setFileViewer((current) => current ? { ...current, expanded } : null)}
          onClose={() => setFileViewer(null)}
        />
      )}

      {/* 우클릭 컨텍스트 메뉴 — RUN/SPEC 전용 */}
      {menu && (
        <div
          className="ck-pop fixed z-[95] min-w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          <div className="truncate border-b border-[var(--color-border)] px-3 py-1.5 font-mono text-[10.5px] text-[var(--color-text-dim)]">
            {menu.node.level === "spec" ? "SPEC" : "RUN"} · {menu.node.title}
          </div>
          {effStatus(menu.node) === "dropped" ? (
            <button
              disabled={busy}
              onClick={() => run(() => restoreSubtree(userId!, workspace, menu.node.id))}
              className="block w-full px-3 py-1.5 text-left text-[12.5px] text-emerald-300 hover:bg-[var(--color-surface-hover)]"
            >
              복구
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => run(() => dropSubtree(userId!, workspace, menu.node.id))}
              className="block w-full px-3 py-1.5 text-left text-[12.5px] text-rose-300 hover:bg-[var(--color-surface-hover)]"
            >
              폐기 (하위 포함)
            </button>
          )}
          <p className="px-3 py-1 text-[10px] text-[var(--color-text-dim)]">삭제가 아니라 되돌릴 수 있는 폐기입니다.</p>
        </div>
      )}

      {/* 🧠 AI요약 / 📄 원문 / ✎ 이름변경 — 헤더 액션 팝업 */}
      {summaryOf && (
        <HeaderModal title={`🧠 ${summaryOf.title} · AI 작업요약`} onClose={() => setSummaryOf(null)}>
          {parseWorkResult(summaryOf.work_result)?.summary ? (
            <div className="spec-md whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
              {presentSteKorean(parseWorkResult(summaryOf.work_result)!.summary!)}
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--color-text-dim)]">아직 작업요약이 없습니다.</p>
          )}
        </HeaderModal>
      )}

      {specDocumentTarget && (
        <SpecDocumentPanel
          workspace={workspace}
          nodeId={specDocumentTarget.id}
          title={specDocumentTarget.title}
          onClose={() => setSpecDocumentTarget(null)}
        />
      )}

      {renaming && (
        <HeaderModal title="✎ 이름 변경" onClose={() => setRenaming(null)}>
          <input
            autoFocus
            value={renaming.value}
            onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const title = renaming.value.trim();
              if (!title) return;
              void run(() => renameRoadmapNode(userId!, workspace, renaming.node.id, title));
              setRenaming(null);
            }}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[13px] text-[var(--color-text)]"
          />
          <p className="mt-2 text-[11.5px] text-[var(--color-text-dim)]">
            표시명만 바뀝니다(Enter로 저장). 대시보드가 따로 기억하므로 플러그인이 다시 push해도 되돌아가지 않습니다.
          </p>
        </HeaderModal>
      )}

      {/* 폐기함 모달 */}
      {binOpen && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4" onMouseDown={() => setBinOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-xl border border-[var(--color-border)] ck-glass p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-[var(--color-text)]">
              🗑️ 폐기함 <span className="text-[12px] text-[var(--color-text-muted)]">({droppedTop.length})</span>
            </div>
            <div className="ck-scroll max-h-80 space-y-1 overflow-auto pr-1">
              {droppedTop.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5"
                >
                  <span className="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--color-text-dim)]">
                    {n.level}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-text-muted)] line-through">
                    {n.title}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => run(() => restoreSubtree(userId!, workspace, n.id))}
                    className="shrink-0 rounded border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                  >
                    복구
                  </button>
                </div>
              ))}
              {droppedTop.length === 0 && (
                <div className="py-8 text-center text-[12.5px] text-[var(--color-text-dim)]">폐기된 항목이 없습니다</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ReactFlowProvider로 감싼 형태 — 페이지·모달 어디서든 이걸 쓰면 된다. */
export function RoadmapGraphPanel(props: {
  workspace: string;
  fill?: boolean;
  onEdited?: () => void;
  /** RoadmapTab의 "진행 중심" 필터 결과를 그대로 흘려보낸다. */
  nodeFilter?: RoadmapNode[];
  /** §7B Schedule 탭 딥링크. */
  focusNodeId?: string;
  onFileViewerChange?: (open: boolean) => void;
}) {
  return (
    <ReactFlowProvider>
      <RoadmapGraph {...props} />
    </ReactFlowProvider>
  );
}

/** 헤더 액션(요약·원문·이름변경) 공용 팝업. 캔버스 위에 떠야 하므로 z는 폐기함보다 낮게 둔다. */
function HeaderModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[94] flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[75vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--color-border)] ck-glass p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-[var(--color-text-bright)]">{title}</span>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            ✕
          </button>
        </div>
        <div className="ck-scroll min-h-0 flex-1 overflow-auto pr-1">{children}</div>
      </div>
    </div>
  );
}
