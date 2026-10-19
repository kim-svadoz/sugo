import { useEffect } from "react";
import { X } from "lucide-react";

/** 공용 모달. ESC 닫기, 오버레이 클릭 닫기, 기본 max-w-3xl. */
export function Modal({
  children,
  onClose,
  disableEscape,
  size = "default",
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** 이 Modal 위에 다른 오버레이(체크포인트/캔버스)가 열려 있는 동안 true로 두면
   * Escape를 무시한다. 안 그러면 이 Modal과 위에 뜬 오버레이가 같은 keydown에 동시에
   * 반응해서 Esc 한 번에 둘 다 닫혀버린다(오버레이만 닫고 이 Modal로 돌아와야 하는데). */
  disableEscape?: boolean;
  size?: "default" | "wide" | "xwide";
}) {
  useEffect(() => {
    if (disableEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, disableEscape]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`${size === "xwide" ? "max-h-[92vh] max-w-[1320px]" : size === "wide" ? "max-h-[88vh] max-w-[1080px]" : "max-h-[80vh] max-w-3xl"} w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end border-b border-[var(--color-border)] p-2">
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--color-border)]" title="Close (ESC)">
            <X size={20} className="text-[var(--color-text-muted)]" />
          </button>
        </div>
        <div className={`${size === "xwide" ? "max-h-[calc(92vh-60px)] px-9 py-7" : size === "wide" ? "max-h-[calc(88vh-60px)] px-7 py-6" : "max-h-[calc(80vh-60px)] p-6"} overflow-auto`}>{children}</div>
      </div>
    </div>
  );
}
