import { useEffect, useMemo, useState } from "react";
import { useRoadmap, type RoadmapNode } from "../hooks/useRoadmap.js";
import { LiveLogTail } from "./LiveConsole.js";
import { cn } from "../lib/utils.js";

function effStatus(n: RoadmapNode): string {
  return (n.manual_status ?? n.status ?? "pending").toLowerCase();
}

const LABEL: Record<string, { label: string; cls: string }> = {
  done: { label: "완료", cls: "border-emerald-600/40 text-emerald-300" },
  in_progress: { label: "진행중", cls: "border-[#5c8bcc]/50 text-[#8ab0e0]" },
  blocked: { label: "막힘", cls: "border-amber-500/50 text-amber-300" },
  dropped: { label: "취소", cls: "border-slate-700 text-slate-500" },
  pending: { label: "대기", cls: "border-slate-600/50 text-slate-400" },
};

/**
 * 설계안 **Agent Canvas 오버레이 모달** 본문 + 하단 LiveLogTail.
 *
 * 전체 그래프(`/roadmap/:workspace`)와 달리 여기서는 **계층을 접힌 트리로** 보여준다 — 오버레이는
 * "지금 어디까지 왔나"를 훑는 자리라 dagre 캔버스를 그대로 얹으면 모달 안에서 다시 팬/줌을 해야 한다.
 * 편집이 필요하면 전체화면으로 가라고 링크를 준다.
 *
 * **4초 독립 폴링(§6):** 오버레이가 열려 있는 동안만 갱신한다. 단 (a) 탭이 백그라운드면 건너뛰고
 * (b) 입력 중이면 건너뛴다 — 보이지도 않는 화면을 위해 서버를 때리거나, 타이핑 중 리렌더로
 * 포커스를 흔들지 않기 위해서다.
 */
export function RoadmapPreview({ workspace, onOpenFull }: { workspace: string; onOpenFull: () => void }) {
  const { data, loading, refetch } = useRoadmap(workspace);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      refetch();
      setTick((t) => t + 1);
    }, 4000);
    return () => window.clearInterval(id);
  }, [refetch]);

  const nodes = useMemo(() => data ?? [], [data]);

  /** parent 링크로 접힌 트리를 만든다. 부모가 없는 노드가 뿌리. */
  const tree = useMemo(() => {
    const children = new Map<string, RoadmapNode[]>();
    const roots: RoadmapNode[] = [];
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      if (n.parent && ids.has(n.parent)) {
        children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
      } else {
        roots.push(n);
      }
    }
    return { roots, children };
  }, [nodes]);

  const row = (n: RoadmapNode, depth: number) => {
    const st = effStatus(n);
    const meta = LABEL[st] ?? LABEL.pending;
    return (
      <div key={n.id}>
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5",
            st === "dropped" && "opacity-55",
          )}
          style={{ marginLeft: depth * 18 }}
        >
          <span className="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--color-text-dim)]">
            {n.level}
          </span>
          <span className={cn("min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--color-text)]", st === "dropped" && "line-through")}>
            {n.title}
          </span>
          {n.manual_status && <span className="shrink-0 text-[9.5px] text-amber-300">✋</span>}
          <span className={cn("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9.5px]", meta.cls)}>{meta.label}</span>
        </div>
        {(tree.children.get(n.id) ?? []).map((c) => row(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between">
        <span className="font-mono text-[13px] font-semibold text-[var(--color-text-bright)]">
          {workspace} · Agent Canvas
        </span>
        <button
          onClick={onOpenFull}
          className="rounded-lg border border-purple-500/40 px-2.5 py-1 font-mono text-[11px] text-purple-300 transition-colors hover:bg-purple-500/10"
        >
          전체화면으로 열기 →
        </button>
      </div>

      <div className="ck-scroll min-h-0 flex-1 space-y-1 overflow-auto pr-1">
        {loading && nodes.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-[var(--color-text-dim)]">Agent Canvas 불러오는 중…</div>
        ) : nodes.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-[var(--color-text-dim)]">Agent Canvas 데이터가 없습니다</div>
        ) : (
          tree.roots.map((n) => row(n, 0))
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--color-border)] pt-2">
        <LiveLogTail workspace={workspace} />
      </div>
      <span className="sr-only">{tick}</span>
    </div>
  );
}
