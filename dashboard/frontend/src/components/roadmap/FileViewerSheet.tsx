import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, ChevronLeft, ChevronRight, Database, File, FileCode2, FileText, FlaskConical, Maximize2, Minimize2, Palette, X } from "lucide-react";
import type { WorkResultFile } from "../../hooks/useRoadmap.js";
import { diffChangeRegions, fileViewerLanguage, fileViewerLines, fileViewerPresentation, fileViewerText, type FileViewerKind } from "./fileViewerModel.js";

const toneStyle = {
  cyan: { border: "border-cyan-400/35", bg: "bg-cyan-400/10", text: "text-cyan-300", glow: "from-cyan-400/35" },
  violet: { border: "border-violet-400/35", bg: "bg-violet-400/10", text: "text-violet-300", glow: "from-violet-400/35" },
  amber: { border: "border-amber-400/35", bg: "bg-amber-400/10", text: "text-amber-300", glow: "from-amber-400/35" },
  emerald: { border: "border-emerald-400/35", bg: "bg-emerald-400/10", text: "text-emerald-300", glow: "from-emerald-400/35" },
  sky: { border: "border-sky-400/35", bg: "bg-sky-400/10", text: "text-sky-300", glow: "from-sky-400/35" },
  rose: { border: "border-rose-400/35", bg: "bg-rose-400/10", text: "text-rose-300", glow: "from-rose-400/35" },
  slate: { border: "border-slate-400/30", bg: "bg-slate-400/10", text: "text-slate-300", glow: "from-slate-400/25" },
} as const;

function KindIcon({ kind }: { kind: FileViewerKind }) {
  if (kind === "test") return <FlaskConical size={18} />;
  if (kind === "config") return <Braces size={18} />;
  if (kind === "document") return <FileText size={18} />;
  if (kind === "data") return <Database size={18} />;
  if (kind === "style") return <Palette size={18} />;
  if (kind === "code") return <FileCode2 size={18} />;
  return <File size={18} />;
}

export function FileViewerSheet({
  file,
  files,
  expanded,
  onSelectFile,
  onExpandedChange,
  onClose,
}: {
  file: WorkResultFile;
  files: WorkResultFile[];
  expanded: boolean;
  onSelectFile: (file: WorkResultFile) => void | Promise<void>;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [regionIndex, setRegionIndex] = useState(0);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const text = fileViewerText(file);
  const lines = fileViewerLines(file);
  const presentation = fileViewerPresentation(file.path);
  const tone = toneStyle[presentation.tone];
  const pathParts = file.path.split("/");
  const fileName = pathParts.pop() ?? file.path;
  const directory = pathParts.join("/");
  const showingDiff = Boolean(file.diff?.trim());
  const showingAddedFile = file.change === "added" && !showingDiff;
  const regions = useMemo(() => showingAddedFile ? [0] : diffChangeRegions(lines), [text, showingAddedFile]);
  function scrollToLine(lineIndex: number, behavior: ScrollBehavior = "smooth") {
    const container = scrollRef.current;
    const target = lineRefs.current[lineIndex];
    if (!container || !target) return;
    const top = target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior });
  }
  function focusRegion(next: number) {
    if (!regions.length) return;
    const normalized = (next + regions.length) % regions.length;
    setRegionIndex(normalized);
    scrollToLine(regions[normalized]);
  }
  async function selectFile(candidate: WorkResultFile) {
    if (candidate.path === file.path) return;
    setLoadingPath(candidate.path);
    setLoadError(null);
    try {
      await onSelectFile(candidate);
    } catch {
      setLoadError("파일 diff를 불러오지 못했습니다.");
    } finally {
      setLoadingPath(null);
    }
  }
  useEffect(() => {
    setRegionIndex(0);
    const id = window.requestAnimationFrame(() => {
      if (regions.length) scrollToLine(regions[0], "auto");
      else scrollRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(id);
  }, [file.path, text]);
  return (
    <section
      aria-label={`${file.path} 변경파일 바텀시트`}
      className={expanded
        ? "fixed inset-3 z-[120] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-400/35 bg-[#070b12] shadow-[0_0_100px_rgba(0,180,216,0.2)]"
        : "absolute inset-x-0 bottom-0 z-[80] flex h-[43%] min-h-[260px] flex-col overflow-hidden border-t border-cyan-400/30 bg-[#080c13]/[0.98] shadow-[0_-18px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl"}
    >
      <div className={`h-0.5 shrink-0 bg-gradient-to-r ${tone.glow} via-transparent to-transparent`} />
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tone.border} ${tone.bg} ${tone.text}`}>
          <KindIcon kind={presentation.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${tone.border} ${tone.bg} ${tone.text}`}>
              {showingDiff ? "DIFF" : showingAddedFile ? "ADDED" : fileViewerLanguage(file.path)}
            </span>
            <span className={`font-mono text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.text}`}>{presentation.eyebrow}</span>
            <span className="truncate text-[10px] text-[var(--color-text-dim)]">{presentation.description}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-baseline gap-1.5 font-mono" title={file.path}>
            {directory && <span className="truncate text-[10px] text-slate-600">{directory}/</span>}
            <span className="shrink-0 text-[14px] font-semibold text-[var(--color-text-bright)]">{fileName}</span>
          </div>
        </div>
        {regions.length > 0 && <div className="flex items-center rounded-lg border border-white/10 bg-black/20">
          <button type="button" onClick={() => focusRegion(regionIndex - 1)} className="p-2 text-[var(--color-text-muted)] hover:text-cyan-200" title="이전 변경 영역"><ChevronLeft size={17} /></button>
          <span className="min-w-12 text-center font-mono text-[10px] text-[var(--color-text-dim)]">{regionIndex + 1}/{regions.length}</span>
          <button type="button" onClick={() => focusRegion(regionIndex + 1)} className="p-2 text-[var(--color-text-muted)] hover:text-cyan-200" title="다음 변경 영역"><ChevronRight size={17} /></button>
        </div>}
        <button type="button" onClick={() => onExpandedChange(!expanded)} className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-white/5 hover:text-cyan-200" title={expanded ? "하단으로 축소" : "전체화면으로 확장"}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-white/5 hover:text-rose-300" title="닫기 (Esc)">
          <X size={18} />
        </button>
      </header>
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-1.5 font-mono text-[10px] text-[var(--color-text-dim)]">
        <span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${tone.bg} ring-1 ${tone.border}`} />{file.change === "added" ? "추가됨" : file.change === "deleted" ? "삭제됨" : "수정됨"}</span>
        <span>{lines.length}행 · {new Blob([text]).size.toLocaleString()} B</span>
      </div>
      <div className="flex min-h-0 flex-1">
      <div ref={scrollRef} className="ck-scroll min-h-0 min-w-0 flex-1 overflow-auto font-mono text-[11px] leading-6 text-slate-300">
        {lines.map((line, index) => (
          <div ref={(element) => { lineRefs.current[index] = element; }} key={index} className={`flex min-w-max border-b border-white/[0.015] ${showingAddedFile ? "bg-emerald-400/[0.08] text-emerald-200" : showingDiff && line.startsWith("+") && !line.startsWith("+++") ? "bg-emerald-400/[0.08] text-emerald-200" : showingDiff && line.startsWith("-") && !line.startsWith("---") ? "bg-rose-400/[0.08] text-rose-200" : ""}`}>
            <span className="sticky left-0 w-12 shrink-0 select-none border-r border-white/5 bg-[#080c13] pr-3 text-right text-slate-600">{index + 1}</span>
            <span className="w-5 shrink-0 select-none text-center text-emerald-400/80">{showingAddedFile ? "+" : ""}</span>
            <span className="whitespace-pre pr-4">{line || " "}</span>
          </div>
        ))}
      </div>
      {expanded && <aside className="ck-scroll w-[320px] shrink-0 overflow-y-auto border-l border-white/10 bg-black/20 p-2">
        <div className="px-2 pb-2 pt-1 text-[11px] font-semibold text-[var(--color-text-muted)]">변경 파일 {files.length}</div>
        <div className="space-y-1">{files.map((candidate) => <button key={candidate.path} type="button" onClick={() => void selectFile(candidate)} className={`w-full rounded-lg border px-2.5 py-2 text-left ${candidate.path === file.path ? "border-cyan-400/40 bg-cyan-400/10" : "border-transparent hover:border-white/10 hover:bg-white/5"}`} title={candidate.path}>
          <span className="block truncate font-mono text-[11px] text-[var(--color-text)]">{candidate.path.split("/").pop()}</span>
          <span className="mt-0.5 block truncate font-mono text-[9px] text-[var(--color-text-dim)]">{candidate.path}</span>
          {loadingPath === candidate.path && <span className="mt-1 block text-[9px] text-cyan-300">불러오는 중…</span>}
        </button>)}</div>
        {loadError && <div className="mt-2 rounded border border-rose-400/30 bg-rose-400/5 px-2 py-1.5 text-[10px] text-rose-200">{loadError}</div>}
      </aside>}
      </div>
      <div className="shrink-0 border-t border-white/5 px-4 py-1.5 text-right font-mono text-[9px] text-[var(--color-text-dim)]">
        {expanded ? "Esc로 닫기" : "⛶ 전체화면 · Esc로 닫기"}
      </div>
    </section>
  );
}
