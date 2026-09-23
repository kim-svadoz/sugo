import { useEffect } from "react";
import { Braces, Database, File, FileCode2, FileText, FlaskConical, Maximize2, Minimize2, Palette, X } from "lucide-react";
import type { WorkResultFile } from "../../hooks/useRoadmap.js";
import { fileViewerLanguage, fileViewerPresentation, fileViewerText, type FileViewerKind } from "./fileViewerModel.js";

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
  expanded,
  onExpandedChange,
  onClose,
}: {
  file: WorkResultFile;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
}) {
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
  const lines = text.split("\n");
  const presentation = fileViewerPresentation(file.path);
  const tone = toneStyle[presentation.tone];
  const pathParts = file.path.split("/");
  const fileName = pathParts.pop() ?? file.path;
  const directory = pathParts.join("/");
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
              {fileViewerLanguage(file.path)}
            </span>
            <span className={`font-mono text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.text}`}>{presentation.eyebrow}</span>
            <span className="truncate text-[10px] text-[var(--color-text-dim)]">{presentation.description}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-baseline gap-1.5 font-mono" title={file.path}>
            {directory && <span className="truncate text-[10px] text-slate-600">{directory}/</span>}
            <span className="shrink-0 text-[14px] font-semibold text-[var(--color-text-bright)]">{fileName}</span>
          </div>
        </div>
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
      <div className="ck-scroll min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-6 text-slate-300">
        {lines.map((line, index) => (
          <div key={index} className="flex min-w-max border-b border-white/[0.015]">
            <span className="sticky left-0 w-12 shrink-0 select-none border-r border-white/5 bg-[#080c13] pr-3 text-right text-slate-600">{index + 1}</span>
            <span className="whitespace-pre px-4">{line || " "}</span>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-white/5 px-4 py-1.5 text-right font-mono text-[9px] text-[var(--color-text-dim)]">
        {expanded ? "Esc로 닫기" : "⛶ 전체화면 · Esc로 닫기"}
      </div>
    </section>
  );
}
