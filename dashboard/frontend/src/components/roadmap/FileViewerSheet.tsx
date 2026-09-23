import { useEffect } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { WorkResultFile } from "../../hooks/useRoadmap.js";
import { fileViewerLanguage, fileViewerText } from "./fileViewerModel.js";

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

  const lines = fileViewerText(file).split("\n");
  return (
    <section
      aria-label={`${file.path} 변경파일 바텀시트`}
      className={expanded
        ? "fixed inset-3 z-[120] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-400/35 bg-[#070b12] shadow-[0_0_100px_rgba(0,180,216,0.2)]"
        : "absolute inset-x-0 bottom-0 z-[80] flex h-[43%] min-h-[260px] flex-col overflow-hidden border-t border-cyan-400/30 bg-[#080c13]/[0.98] shadow-[0_-18px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl"}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="rounded border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 font-mono text-[10px] font-semibold text-cyan-300">
          {fileViewerLanguage(file.path)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-[var(--color-text-dim)]">전체 파일</div>
          <div className="truncate font-mono text-[14px] font-semibold text-[var(--color-text-bright)]" title={file.path}>{file.path}</div>
        </div>
        <button type="button" onClick={() => onExpandedChange(!expanded)} className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-white/5 hover:text-cyan-200" title={expanded ? "하단으로 축소" : "전체화면으로 확장"}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-white/5 hover:text-rose-300" title="닫기 (Esc)">
          <X size={18} />
        </button>
      </header>
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-1.5 font-mono text-[10px] text-[var(--color-text-dim)]">
        <span>{lines.length}행</span><span>{new Blob([fileViewerText(file)]).size.toLocaleString()} B</span>
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
