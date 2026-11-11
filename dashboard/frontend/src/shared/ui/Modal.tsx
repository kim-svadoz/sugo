import { useEffect } from "react";
import { X } from "lucide-react";

/** Shared dialog shell. Existing Console dimensions and class contract are intentionally preserved. */
export function Modal({ children, onClose, disableEscape, size = "default" }: {
  children: React.ReactNode;
  onClose: () => void;
  disableEscape?: boolean;
  size?: "default" | "wide" | "xwide";
}) {
  useEffect(() => {
    if (disableEscape) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, disableEscape]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className={`${size === "xwide" ? "max-h-[92vh] max-w-[1320px]" : size === "wide" ? "max-h-[88vh] max-w-[1080px]" : "max-h-[80vh] max-w-3xl"} w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]`} onClick={(event) => event.stopPropagation()}>
      <div className="flex justify-end border-b border-[var(--color-border)] p-2"><button onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-border)]" title="Close (ESC)"><X size={20} className="text-[var(--color-text-muted)]" /></button></div>
      <div className={`${size === "xwide" ? "max-h-[calc(92vh-60px)] px-9 py-7" : size === "wide" ? "max-h-[calc(88vh-60px)] px-7 py-6" : "max-h-[calc(80vh-60px)] p-6"} overflow-auto`}>{children}</div>
    </div>
  </div>;
}
