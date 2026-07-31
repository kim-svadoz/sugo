import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import {
  parseLineage,
  parseWorkResult,
  type RoadmapNode,
  type WorkResultFile,
} from "../hooks/useRoadmap.js";
import { clearManualStatus, setManualStatus } from "../api/roadmapMutationsApi.js";
import { checkExistingPr, createPr, type PrRef, type PrScope } from "../api/prApi.js";

type Tab = "progress" | "summary" | "files";

function scopeForLevel(level: string): PrScope {
  if (level === "spec") return "spec";
  if (level === "workstream") return "run";
  return "task";
}

function fileBadge(change: WorkResultFile["change"]): string {
  if (change === "added") return "A";
  if (change === "deleted") return "D";
  return "M";
}

function fileBadgeColor(change: WorkResultFile["change"]): string {
  if (change === "added") return "#10b981";
  if (change === "deleted") return "#ef4444";
  return "#f59e0b";
}

// §5 SubtaskPanel(폭 420, 탭 progress/summary/files) — 이번 증분은 "한번 쫙 만들고
// 나중에 리팩토링" 방침으로 기능 우선 구현. WorkResult 메타/수동 done-취소/PR 패널/
// lineage는 progress 탭에 몰아넣음(원본은 레이아웃이 더 세분화돼 있었을 수 있음 —
// 실제 브라우저로 볼 수 있게 되면 재배치할 것).
export function SubtaskPanel({
  workspace,
  node,
  onClose,
  onChanged,
}: {
  workspace: string;
  node: RoadmapNode;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { userId } = useAuth();
  const [tab, setTab] = useState<Tab>("progress");

  const workResult = parseWorkResult(node.work_result);
  const lineage = parseLineage(node.lineage);

  return (
    <aside className="ck-glass flex w-[420px] shrink-0 flex-col overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-white/10 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{node.title}</div>
          <div className="font-mono text-xs opacity-60">
            {node.id} · {node.level}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-xs opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>

      <div className="flex border-b border-white/10 text-xs">
        {(["progress", "summary", "files"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 uppercase ${tab === t ? "ck-glow-cyan" : "opacity-60 hover:opacity-100"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="ck-scroll flex-1 space-y-4 p-3 text-sm">
        {tab === "progress" && (
          <ProgressTab
            userId={userId}
            workspace={workspace}
            node={node}
            workResult={workResult}
            lineage={lineage}
            onChanged={onChanged}
          />
        )}
        {tab === "summary" && <SummaryTab summary={workResult?.summary} />}
        {tab === "files" && <FilesTab files={workResult?.files ?? []} />}
      </div>
    </aside>
  );
}

function durationLabel(startedAt?: string, endedAt?: string): string | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  return `${minutes}분`;
}

function ProgressTab({
  userId,
  workspace,
  node,
  workResult,
  lineage,
  onChanged,
}: {
  userId: string | null;
  workspace: string;
  node: RoadmapNode;
  workResult: ReturnType<typeof parseWorkResult>;
  lineage: ReturnType<typeof parseLineage>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleManualDone() {
    if (!userId) return;
    setBusy(true);
    try {
      await setManualStatus(userId, workspace, node.id, "done");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelManual() {
    if (!userId) return;
    setBusy(true);
    try {
      await clearManualStatus(userId, workspace, node.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function handleCopyPatchBridge() {
    const cmd = `/sugo:patch ${workspace} ${node.id}${workResult?.seed ? ` "${workResult.seed}"` : ""}`;
    void navigator.clipboard?.writeText(cmd);
  }

  const duration = durationLabel(workResult?.startedAt, workResult?.endedAt);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="font-mono text-xs uppercase opacity-60">Work Result</div>
        {workResult ? (
          <div className="space-y-1 text-xs">
            {workResult.model && <div>model: {workResult.model}</div>}
            {duration && <div>소요: {duration}</div>}
            {workResult.seed && <div>seed: {workResult.seed}</div>}
            <div className="flex gap-2 pt-1">
              {workResult.runtimeVerified && (
                <span className="rounded px-2 py-0.5" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                  runtime ✓
                </span>
              )}
              {workResult.wiringVerified && (
                <span className="rounded px-2 py-0.5" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                  wiring ✓
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs opacity-50">아직 work_result 없음</div>
        )}
      </div>

      {lineage.length > 0 && (
        <div className="space-y-1">
          <div className="font-mono text-xs uppercase opacity-60">Lineage</div>
          <div className="space-y-1">
            {lineage.map((entry) => (
              <div key={entry.version} className="neon-border-violet ck-line-in rounded p-2 text-xs">
                <span style={{ color: "var(--color-secondary)" }}>v{entry.version}</span>{" "}
                {entry.title ?? entry.summary ?? ""}{" "}
                <span className="opacity-50">{entry.completedAt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="font-mono text-xs uppercase opacity-60">수동 조작</div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleManualDone()}
            className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/5"
          >
            수동 완료
          </button>
          {node.manual_status && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCancelManual()}
              className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/5"
            >
              취소
            </button>
          )}
          <button type="button" onClick={handleCopyPatchBridge} className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/5">
            /sugo:patch 복사
          </button>
        </div>
      </div>

      <PrPanel workspace={workspace} node={node} />
    </div>
  );
}

function PrPanel({ workspace, node }: { workspace: string; node: Pick<RoadmapNode, "id" | "level"> }) {
  const [scope, setScope] = useState<PrScope>(scopeForLevel(node.level));
  const [targetBranch, setTargetBranch] = useState("develop");
  const [title, setTitle] = useState("");
  const [pr, setPr] = useState<PrRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkExistingPr({ workspace, nodeId: node.id, scope, targetBranch })
      .then((res) => {
        if (cancelled) return;
        setPr(res.pr ?? null);
        setError(res.exists ? null : res.error ?? null);
      })
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [workspace, node.id, scope, targetBranch]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const res = await createPr({ workspace, nodeId: node.id, scope, title: title || undefined, targetBranch });
      if (res.pr) {
        setPr(res.pr);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="font-mono text-xs uppercase opacity-60">Pull Request</div>
      <div className="flex gap-2">
        <select value={scope} onChange={(e) => setScope(e.target.value as PrScope)} className="rounded bg-white/5 px-2 py-1 text-xs">
          <option value="task">task</option>
          <option value="run">run</option>
          <option value="spec">spec</option>
        </select>
        <input
          value={targetBranch}
          onChange={(e) => setTargetBranch(e.target.value)}
          placeholder="target branch"
          className="w-24 rounded bg-white/5 px-2 py-1 text-xs"
        />
      </div>
      {pr ? (
        <a href={pr.url} target="_blank" rel="noreferrer" className="block text-xs" style={{ color: "var(--color-primary)" }}>
          PR #{pr.id} 열기 →
        </a>
      ) : (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="PR 제목 (선택)"
            className="w-full rounded bg-white/5 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCreate()}
            className="ck-glow-cyan rounded px-3 py-1 text-xs"
            style={{ border: "1px solid var(--color-primary)" }}
          >
            PR 생성
          </button>
          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
      )}
    </div>
  );
}

function SummaryTab({ summary }: { summary?: string }) {
  if (!summary) return <div className="text-xs opacity-50">summary 없음</div>;
  // §5 "마크다운 summary" - 지금은 원문 그대로 렌더(실제 마크다운 렌더러는 나중에
  // 리팩토링 때 붙일 것, 지금은 브라우저로 볼 수 없어서 우선순위 낮음).
  return <pre className="whitespace-pre-wrap font-sans text-xs">{summary}</pre>;
}

function FilesTab({ files }: { files: WorkResultFile[] }) {
  const [selected, setSelected] = useState<WorkResultFile | null>(null);
  if (files.length === 0) return <div className="text-xs opacity-50">변경된 파일 없음</div>;
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {files.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => setSelected(f)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-white/5 ${
                selected?.path === f.path ? "bg-white/5" : ""
              }`}
            >
              <span className="font-mono" style={{ color: fileBadgeColor(f.change) }}>
                {fileBadge(f.change)}
              </span>
              <span className="truncate">{f.path}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected?.diff && (
        <pre className="ck-scroll max-h-64 overflow-x-auto rounded bg-black/30 p-2 font-mono text-xs">{selected.diff}</pre>
      )}
    </div>
  );
}
