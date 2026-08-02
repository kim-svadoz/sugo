import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useAuth } from "../../auth/AuthContext.js";
import { parseWorkResult, useRoadmap, type RoadmapNode } from "../../hooks/useRoadmap.js";
import {
  assignRunToSpec,
  dropSubtree,
  getSpecContent,
  renameRoadmapNode,
  restoreSubtree,
} from "../../api/roadmapMutationsApi.js";
import { SubtaskPanel } from "../SubtaskPanel.js";
import { cn } from "../../lib/utils.js";

/** 설계안 치수 상수 — 그대로. */
const NODE_W = 236;
const WS_CARD_W = 560;
const CARD_H = 130;
const LINEAGE_VCARD_H = 72;
const ALERT = "#fb923c";
const C_READY = "#4fa87f";
const C_PROG = "#5c8bcc";
const CONT_HEADER = 54;
const CONT_PAD = 16;
const DROP_ROOM = 44;
/** 미분류 밴드(📋)가 차지하는 세로 폭 — 컨테이너 헤더 아래에 한 줄 더 얹힌다. */
const BAND_H = 30;
/** SPEC 안에서 RUN들이 가로로 늘어설 때의 간격(컨테이너 내부 dagre의 ranksep과 같은 값). */
const RUN_GAP = 80;
/**
 * Spec에 편입되지 않은 RUN들을 담는 **가상 컨테이너**의 id.
 * 서버에 이런 노드는 없다 — 화면에서만 만든다. `assignRunToSpec(run, null)`로 분리한 RUN이
 * 최상위에 흩어져 "왜 여기 떠 있지"가 되는 걸 막고, 설계안의 📋미분류 밴드를 걸어준다.
 */
const UNASSIGNED = "__unassigned__";
/** 설계안 패치 체인 치수. */
const PC_COL_W = 280;
const PC_COL_GAP = 30;
const PC_FORK_H = 48;
const PC_CARD_GAP = 18;
/** 체인 노드 id 접두어 — 서버 노드가 아니라 여러 patch task를 묶은 화면 전용 노드다. */
const CHAIN = "chain:";

/**
 * `lineage` 컬럼은 계약상 `unknown`이다(스키마가 열려 있다). 화면이 쓰는 필드만 **방어적으로**
 * 읽는다 — 모양이 달라져도 체인이 통째로 사라지지 않고 depth 0 한 줄로 접힐 뿐이다.
 */
type Lineage = { root?: string; depth?: number; version?: number };
function readLineage(v: unknown): Lineage | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    root: typeof o.root === "string" ? o.root : undefined,
    depth: typeof o.depth === "number" ? o.depth : undefined,
    version: typeof o.version === "number" ? o.version : undefined,
  };
}
/** 체인 안의 카드 한 장. */
type ChainItem = { node: RoadmapNode; depth: number; version: number };

function effStatus(n: RoadmapNode): string {
  return (n.manual_status ?? n.status ?? "pending").toLowerCase();
}

/** 설계안 statusColor — ready(착수가능)가 in_progress보다 우선한다. */
function statusColor(status: string, ready: boolean): string {
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
  /** 드래그 중인 RUN이 이 컨테이너 위에 있는가 → "＋ 여기에 놓기". */
  isDropTarget?: boolean;
  /** lineage 노드 전용 — 이 체인에 묶인 patch 카드들(컬럼=sibling, 세로=serial). */
  chain?: ChainItem[][];
  /** 체인이 접혀 있는가(depth 0만 보인다). */
  collapsed?: boolean;
  onSelect?: (id: string) => void;
  /** 체인 안에서 실제로 선택된 patch의 id — 체인 노드 자신의 id와는 다르다. */
  selectedItemId?: string | null;
};
type FlowNode = Node<NodeData, "roadmap" | "container" | "lineage">;

/**
 * nodeTypes ① — 접힌 **task 카드**와 접힌 **SPEC/RUN 폴더 카드**를 둘 다 그린다(설계안).
 *
 * 접힌 SPEC/RUN은 일반 task 카드가 아니라 **폴더**다: `WS_CARD_W` 폭 + 대시 테두리 + 헤더 밴드
 * + 펼치기 chevron. **클릭하면 펼쳐진다** — 접힌 폴더에서 사람이 기대하는 건 클릭이지
 * 더블클릭이 아니다(더블클릭도 같이 받는다).
 */
function RoadmapNodeCard({ data }: NodeProps<FlowNode>) {
  const n = data.node;
  const st = effStatus(n);
  const isSpec = n.level === "spec";
  const isGroup = isSpec || n.level === "workstream";
  const cs = cardStyle(st, data.ready, isGroup);
  const dim = st === "dropped";

  if (isGroup) {
    const expand = (e: React.MouseEvent) => {
      e.stopPropagation();
      data.onToggleExpand?.();
    };
    return (
      <div className="group/card" style={{ width: WS_CARD_W, opacity: dim ? 0.6 : 1 }}>
        <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
        <div
          className="cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all duration-150 group-hover/card:brightness-110"
          style={{ borderColor: cs.border, background: "rgba(30,41,59,0.35)" }}
          title={isSpec ? "SPEC(마스터 PRD)" : "RUN(실행 묶음)"}
          onClick={expand}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap border-b border-slate-500/25 bg-slate-500/15 py-2.5 pl-2 pr-3">
            <button
              className="nodrag -my-1 flex h-8 w-8 items-center justify-center rounded text-[15px] leading-none text-slate-200 hover:bg-slate-400/20 hover:text-white"
              title="펼치기"
              onClick={expand}
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

  return (
    <div className="group/card" style={{ width: NODE_W, opacity: dim ? 0.55 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 9, height: 9, left: -5 }} />
      <div
        className="overflow-hidden rounded-xl border transition-all duration-150"
        style={{
          borderColor: data.selected ? cs.accent : cs.border,
          background: "var(--color-surface)",
          boxShadow: data.selected ? `0 0 0 1px ${cs.accent}, 0 0 18px ${cs.accent}55` : `inset 3px 0 0 ${cs.accent}`,
          padding: "8px 10px",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded border px-1.5 py-0.5 font-mono text-[9.5px]"
            style={{ color: cs.accent, borderColor: `${cs.accent}66` }}
          >
            {n.level}
          </span>
          <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase" style={{ color: cs.accent }}>
            {st === "in_progress" && (
              <span className="h-1.5 w-1.5 rounded-full ck-pulse-dot" style={{ background: cs.accent }} />
            )}
            {cs.label}
          </span>
        </div>
        <div className={cn("mt-1 truncate font-mono text-[12.5px] text-slate-100", dim && "line-through")} title={n.title}>
          {n.title}
        </div>
        {n.manual_status && <span className="mt-1 inline-block text-[9.5px] text-amber-300">✋ 수동</span>}
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
          borderColor: data.isDropTarget ? "rgba(52,211,153,0.85)" : isBand ? "rgba(251,191,36,0.55)" : "#4b5261",
          background: data.isDropTarget ? "rgba(16,185,129,0.10)" : "rgba(30,41,59,0.35)",
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
        <div className="flex items-center gap-1.5 whitespace-nowrap border-b border-slate-500/25 bg-slate-500/15 py-2.5 pl-2 pr-3">
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
          <span
            className={cn("min-w-0 flex-1 truncate text-slate-200/90", isSpec ? "text-[15px] font-semibold" : "text-[13px]")}
            title={n.title}
          >
            {isBand ? "· 어느 Spec에도 편입되지 않은 RUN — 카드를 SPEC 위로 끌어다 놓으세요" : `· ${n.title}`}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-slate-400">
            {isSpec ? `RUN ${data.childCount ?? 0}개` : `task ${data.childCount ?? 0}개 (${data.doneChildCount ?? 0} done)`}
          </span>

          {/* 설계안 헤더 우측 액션. SPEC 전용 뱃지/버튼은 SPEC에서만 뜬다. */}
          <div className="nodrag ml-auto flex shrink-0 items-center gap-2">
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
 * nodeTypes ③: patch 계보 체인(설계안 · 보라 계열 §5.4 secondary).
 *
 * 카드 한 장이 아니라 **체인 하나가 노드 하나**다. 위쪽 stem에서 컬럼마다 violet 점선 베지어가
 * 갈라져 나오고(fork), 같은 컬럼 안에서는 세로로 쌓인다 — 컬럼=형제 패치, 세로=연속 차수.
 * 접으면 각 컬럼의 depth 0 한 장만 남고 "▾ +N패치" 버튼이 붙는다.
 */
function LineageChainNode({ data }: NodeProps<FlowNode>) {
  const cols = data.chain ?? [];
  const isColl = data.collapsed !== false;
  const ncols = Math.max(cols.length, 1);
  const totalW = ncols * PC_COL_W + (ncols - 1) * PC_COL_GAP;
  const stemX = totalW / 2;
  const dy = PC_FORK_H * 0.55;
  const colCenter = (i: number) => i * (PC_COL_W + PC_COL_GAP) + PC_COL_W / 2;
  // "최신"은 **차수가 가장 높은 한 장**이다. 컬럼마다 붙이면 최신이 여러 개가 돼 의미가 없다.
  const latestId = cols.flat().reduce<ChainItem | null>((a, b) => (!a || b.version > a.version ? b : a), null)?.node.id;

  return (
    <div className="relative" style={{ width: totalW }}>
      <Handle type="target" position={Position.Left} style={{ top: 16, opacity: 0 }} />
      <Handle type="target" position={Position.Top} id="top" style={{ left: stemX, opacity: 0, width: 8, height: 8 }} />
      <svg className="pointer-events-none absolute" style={{ left: 0, top: 0 }} width={totalW} height={PC_FORK_H}>
        {cols.map((col, i) => (
          <path
            key={col[0].node.id}
            d={`M ${stemX} 0 C ${stemX} ${dy}, ${colCenter(i)} ${PC_FORK_H - dy}, ${colCenter(i)} ${PC_FORK_H}`}
            stroke="#8B5CF6"
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
            opacity={0.8}
          />
        ))}
      </svg>

      <div className="flex" style={{ gap: PC_COL_GAP, paddingTop: PC_FORK_H }}>
        {cols.map((col) => {
          const shown = isColl ? col.slice(0, 1) : col;
          const hasChildren = col.length > 1;
          return (
            <div key={col[0].node.id} className="flex flex-col" style={{ width: PC_COL_W, gap: PC_CARD_GAP }}>
              {shown.map((item, ri) => {
                const st = effStatus(item.node);
                return (
                  <div key={item.node.id} className="relative">
                    {/* 같은 컬럼의 앞 카드와 잇는 세로 점선 = 연속 차수 */}
                    {ri > 0 && (
                      <div
                        className="absolute border-l-2 border-dashed"
                        style={{ left: "50%", top: -PC_CARD_GAP, height: PC_CARD_GAP, borderColor: "#8B5CF6", opacity: 0.7 }}
                      />
                    )}
                    <div
                      className={cn(
                        "cursor-pointer overflow-hidden rounded-xl border bg-violet-500/10 px-2.5 py-2 transition-all hover:brightness-110",
                        data.selectedItemId === item.node.id ? "border-violet-300" : "border-violet-500/50",
                      )}
                      style={{ height: LINEAGE_VCARD_H }}
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onSelect?.(item.node.id);
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 rounded bg-violet-500/25 px-1.5 py-0.5 font-mono text-[12px] font-bold text-violet-100">
                          v{item.version}-patch
                        </span>
                        {item.node.id === latestId && (
                          <span className="shrink-0 font-mono text-[10px] text-violet-300/80">최신</span>
                        )}
                        <span
                          className="ml-auto shrink-0 font-mono text-[10px] uppercase"
                          style={{ color: statusColor(st, false) }}
                        >
                          {st === "done" ? "완료" : cardStyle(st, false, false).label}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[12.5px] text-[var(--color-text)]" title={item.node.title}>
                        🔁 {item.node.title}
                      </div>
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
 * **의존(`depends_on`)은 task ↔ task 전용이다** — 플러그인 스펙 §"링크 타입"의 `task → task`,
 * 백엔드 `LINK_REQUIRES_TASK_LEVEL`과 같은 계약이다. RUN/SPEC 사이의 순서는 의존이 아니라
 * **포함(parent)** 으로 표현한다. v1은 아무 레벨에나 링크를 그렸는데, 그러면 "RUN이 RUN을
 * 기다린다"는, 온톨로지에 없는 관계가 화면에만 생겨난다.
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
      h: PC_FORK_H + rows * LINEAGE_VCARD_H + (rows - 1) * PC_CARD_GAP,
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
  const linNodes = nodes.filter((n) => readLineage(n.lineage));
  if (linNodes.length > 0) {
    const groups = new Map<string, RoadmapNode[]>();
    for (const n of linNodes) {
      const key = readLineage(n.lineage)!.root ?? n.parent ?? n.id;
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    for (const [root, members] of groups) {
      const id = CHAIN + root;
      const cols: ChainItem[][] = [];
      const sorted = [...members].sort((a, b) => (readLineage(a.lineage)!.version ?? 0) - (readLineage(b.lineage)!.version ?? 0));
      for (const m of sorted) {
        const l = readLineage(m.lineage)!;
        const item: ChainItem = { node: m, depth: l.depth ?? 0, version: l.version ?? 0 };
        if (item.depth === 0 || cols.length === 0) cols.push([item]);
        else cols[cols.length - 1].push(item);
      }
      chainCols.set(id, cols);

      // 원본 노드들을 빼고 체인 노드 한 개로 갈아끼운다. 소속(부모 RUN)은 첫 멤버를 따른다 —
      // patch는 새 Run을 만들지 않고 **원본 Run에 귀속**되기 때문이다(플러그인 스펙 §성숙).
      const parent = members[0].parent;
      const chainNode = { id, title: root, level: "task", status: effStatus(members[0]), parent, lineage: {} } as RoadmapNode;
      byId.set(id, chainNode);
      const memberIds = new Set(members.map((m) => m.id));
      for (const id of memberIds) absorbed.add(id);
      const strip = (arr: RoadmapNode[]) => arr.filter((n) => !memberIds.has(n.id));
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
            : { w: NODE_W, h: CARD_H / 2 };
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
        childPos.set(c.id, { x, y: innerTop(n.id) + CONT_PAD });
        x += cs.w + RUN_GAP;
        rowH = Math.max(rowH, cs.h);
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
      const x = (p?.x ?? 0) - cs.w / 2 + CONT_PAD;
      const y = (p?.y ?? 0) - cs.h / 2 + innerTop(n.id) + CONT_PAD;
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
      rfEdges.push({
        id: `${dep}->${n.id}`,
        source: dep,
        target: n.id,
        type: "default",
        animated: effStatus(n) === "in_progress",
        style: { stroke: "rgba(148,163,184,0.45)" },
      });
    }
  }

  // ReactFlow는 **부모가 배열에서 자식보다 먼저** 와야 한다 — 위에서 아래로 훑어 담는다.
  const rfNodes: FlowNode[] = [];
  const emit = (n: RoadmapNode, parentId?: string) => {
    const kind = kindOf(n);
    const draggable = n.level === "workstream" && n.id !== UNASSIGNED;
    const s = size.get(n.id)!;
    const rootPos = g.node(n.id);
    const position = parentId
      ? (childPos.get(n.id) ?? { x: 0, y: 0 })
      : { x: (rootPos?.x ?? 0) - s.w / 2, y: (rootPos?.y ?? 0) - s.h / 2 };

    rfNodes.push({
      id: n.id,
      type: kind,
      position,
      // RUN만 끌 수 있다 — Spec 컨테이너 위로 끌어다 놓으면 편입된다(설계안 drop 타깃).
      // 나머지는 고정. 전부 draggable로 풀면 좌드래그 패닝(panOnDrag[0])과 싸운다.
      //
      // 끌 수 있는 RUN에는 `extent:"parent"`를 걸지 않는다 — 걸면 부모 상자 안에 갇혀서
      // **다른 Spec 위로 끌고 갈 수가 없다**(편입 기능 자체가 죽는다). 나머지는 그대로 가둔다.
      ...(parentId ? { parentId, ...(draggable ? {} : { extent: "parent" as const }) } : {}),
      draggable,
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
}: {
  workspace: string;
  fill?: boolean;
  onEdited?: () => void;
}) {
  const { userId } = useAuth();
  const { data, loading, error, refetch } = useRoadmap(workspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 펼친 SPEC/RUN 집합. **기본은 SPEC만 펼침** — 처음 열었을 때 최상위 구조가 보이되
   *  RUN 안의 task까지 한꺼번에 쏟아지지 않게 한다(더블클릭으로 한 단계씩 내려간다). */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  /** 헤더 액션 팝업: 🧠 AI요약 / 📄 원문 / ✎ 이름변경. 셋 다 같은 자리에 뜬다. */
  const [summaryOf, setSummaryOf] = useState<RoadmapNode | null>(null);
  const [specDoc, setSpecDoc] = useState<{ title: string; content: string | null } | null>(null);
  const [renaming, setRenaming] = useState<{ node: RoadmapNode; value: string } | null>(null);

  const nodes = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (seeded || nodes.length === 0) return;
    setExpanded(new Set(nodes.filter((n) => n.level === "spec").map((n) => n.id)));
    setSeeded(true);
  }, [nodes, seeded]);

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
      onViewSpec: async (n: RoadmapNode) => {
        const label = n.spec_path?.split(/[\/]/).filter(Boolean).pop() ?? n.title;
        // 원문이 없으면 null이 온다 — 모달은 열되 "없음"을 정직하게 보여준다.
        setSpecDoc((await getSpecContent(userId!, workspace, n.title)) ?? { title: label, content: null });
      },
      onRename: (n: RoadmapNode) => setRenaming({ node: n, value: n.title }),
      onSelect: (id: string) => setSelectedId((cur) => (cur === id ? null : id)),
    }),
    [userId, workspace],
  );

  /**
   * 설계안 drop 타깃 — RUN 카드를 끌어 SPEC 컨테이너(또는 📋미분류)에 놓으면 편입/분리된다.
   * 판정은 **포인터 위치**로 한다. 끌리는 카드의 bbox 겹침으로 하면 큰 카드가 컨테이너 두 개에
   * 동시에 걸려 어디로 갈지 사람이 예측할 수 없다.
   */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const hitTest = useCallback(
    (evt: MouseEvent | TouchEvent, dragged: string): string | null => {
      const pt = "clientX" in evt ? evt : evt.changedTouches[0];
      if (!pt) return null;
      const under = document.elementsFromPoint(pt.clientX, pt.clientY);
      for (const el of under) {
        const holder = el.closest?.("[data-id]") as HTMLElement | null;
        const id = holder?.dataset.id;
        if (!id || id === dragged) continue;
        const n = nodes.find((x) => x.id === id);
        if (id === UNASSIGNED || n?.level === "spec") return id;
      }
      return null;
    },
    [nodes],
  );

  /** 드래그 중인 RUN의 **실시간 좌표**. 이게 없으면 카드가 커서를 안 따라온다(아래 주석 참조). */
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

  const base = useMemo(
    () => layout(nodes, selectedId, expanded, toggleExpand, actions),
    [nodes, selectedId, expanded, toggleExpand, actions],
  );

  /**
   * 드래그 상태는 **layout 밖에서** 덧칠한다. layout 안에 넣으면 드롭 타깃이 바뀔 때마다 전체
   * 레이아웃이 다시 돌면서 좌표가 원래대로 리셋되고, 끌던 카드가 손에서 튕겨 제자리로 돌아간다.
   * ReactFlow는 controlled `nodes`라 배열이 갈릴 때마다 위치를 다시 받아들이기 때문이다.
   */
  const rfNodes = useMemo(() => {
    if (!dropTargetId && !dragPos) return base.rfNodes;
    return base.rfNodes.map((n) => {
      const isTarget = n.id === dropTargetId;
      const moved = dragPos?.id === n.id;
      if (!isTarget && !moved) return n;
      return {
        ...n,
        ...(moved ? { position: { x: dragPos!.x, y: dragPos!.y } } : {}),
        ...(isTarget ? { data: { ...n.data, isDropTarget: true } } : {}),
      };
    });
  }, [base.rfNodes, dropTargetId, dragPos]);
  const rfEdges = base.rfEdges;

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

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
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
    <div className={cn("relative flex min-h-0", fill ? "h-full" : "h-[70vh]")}>
      <div className="relative min-w-0 flex-1">
        {droppedTop.length > 0 && (
          <button
            onClick={() => setBinOpen(true)}
            className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-rose-400/50 hover:text-rose-300"
            title="폐기함 — 버린 항목 보기/복구"
          >
            🗑️ 폐기함 {droppedTop.length}
          </button>
        )}
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          // 설계안: fitView는 **maxZoom 1**로 묶는다. 안 묶으면 노드가 적을 때 화면을 채우려
          // 200%까지 확대돼 카드 몇 장이 화면을 다 덮는다(위상이 안 보인다).
          onInit={(inst) => inst.fitView({ padding: 0.18, maxZoom: 1 })}
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          panOnDrag={[0, 1, 2]}
          zoomOnDoubleClick={false}
          onNodeDrag={(e, node) => {
            setDropTargetId(hitTest(e, node.id));
            setDragPos({ id: node.id, x: node.position.x, y: node.position.y });
          }}
          onNodeDragStop={(e, node) => {
            const target = hitTest(e, node.id);
            setDropTargetId(null);
            setDragPos(null);
            const n = nodes.find((x) => x.id === node.id);
            if (!target || n?.level !== "workstream") return;
            if (target === (n.parent ?? UNASSIGNED)) return; // 제자리에 놓았다 — 아무 일도 안 한다.
            void run(() => assignRunToSpec(userId!, workspace, node.id, target === UNASSIGNED ? null : target));
          }}
          onNodeClick={(_, node) => setSelectedId(node.id === selectedId ? null : node.id)}
          onNodeDoubleClick={(_, node) => {
            // 설계안: SPEC/RUN은 더블클릭으로 펼치고 접는다. task는 펼칠 하위(=REQ)가
            // 그래프에 없으므로 아무 일도 하지 않는다(REQ는 오른쪽 패널 소관).
            const n = nodes.find((x) => x.id === node.id);
            if (!n || (n.level !== "spec" && n.level !== "workstream")) return;
            toggleExpand(n.id);
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
          <Controls showInteractive={false} />
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
        <div className="ck-scroll w-[340px] shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <SubtaskPanel
            workspace={workspace}
            node={selectedNode}
            reqs={nodes.filter((n) => n.parent === selectedNode.id && n.level === "subtask")}
            onClose={() => setSelectedId(null)}
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
              {parseWorkResult(summaryOf.work_result)!.summary}
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--color-text-dim)]">아직 작업요약이 없습니다.</p>
          )}
        </HeaderModal>
      )}

      {specDoc && (
        <HeaderModal title={`📄 ${specDoc.title} · 원문`} onClose={() => setSpecDoc(null)}>
          {specDoc.content ? (
            <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-[var(--color-text)]">
              {specDoc.content}
            </pre>
          ) : (
            <p className="text-[12.5px] text-[var(--color-text-dim)]">
              원문을 찾지 못했습니다 — 플러그인이 이 Spec을 ADR로 sync해야 여기서 읽을 수 있습니다.
            </p>
          )}
        </HeaderModal>
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
            표시명만 바뀝니다(Enter로 저장) — 플러그인이 push하는 제목은 다음 sync에서 다시 덮어씁니다.
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
export function RoadmapGraphPanel(props: { workspace: string; fill?: boolean; onEdited?: () => void }) {
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
