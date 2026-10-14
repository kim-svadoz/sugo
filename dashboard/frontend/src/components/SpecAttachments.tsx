import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext.js";
import { deleteSpecAttachment, listSpecAttachments, specAttachmentBlobUrl, uploadSpecAttachment } from "../api/roadmapMutationsApi.js";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function imagesFrom(items: DataTransferItemList | FileList | null | undefined): File[] {
  if (!items) return [];
  const files = Array.from(items as ArrayLike<DataTransferItem | File>).map((item) =>
    item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null,
  );
  return files.filter((file): file is File => !!file && IMAGE_TYPES.includes(file.type));
}

/** 클릭해 포커스한 뒤 붙여 넣거나(⌘V) 이미지를 끌어다 놓는 자리. */
export function ImagePasteZone({ onImages, disabled }: { onImages: (files: File[]) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  function accept(files: File[]) {
    if (!disabled && files.length > 0) onImages(files);
  }
  return (
    <div
      tabIndex={disabled ? -1 : 0}
      onPaste={(e: ClipboardEvent<HTMLDivElement>) => {
        const files = imagesFrom(e.clipboardData.items);
        if (files.length > 0) e.preventDefault();
        accept(files);
      }}
      onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setOver(false); accept(imagesFrom(e.dataTransfer.files)); }}
      className={`flex cursor-text items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-3 text-[11.5px] outline-none focus:border-cyan-400/70 focus:bg-cyan-500/[0.06] ${
        over ? "border-cyan-400/70 bg-cyan-500/10 text-cyan-200" : "border-[var(--color-border)] text-[var(--color-text-muted)]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <ImagePlus size={14} /> 여기를 클릭하고 캡처를 붙여 넣기(⌘V) · 이미지 끌어다 놓기
    </div>
  );
}

export function ImageThumb({ src, label, onRemove }: { src: string | null; label: string; onRemove?: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-black/30">
      {src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={label} className="h-20 w-full object-cover" /></a> : <div className="h-20" />}
      <span className="absolute bottom-0 left-0 bg-black/60 px-1.5 text-[9.5px] font-mono text-slate-200">{label}</span>
      {onRemove && (
        <button onClick={onRemove} title="삭제" className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-slate-200 opacity-0 hover:text-rose-300 group-hover:opacity-100">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/** 저장된 SPEC 카드의 기획 화면 첨부. feat가 시작되면 잠겨 보기만 된다. */
export function SpecAttachments({ workspace, nodeId, hasSpec }: { workspace: string; nodeId: string; hasSpec: boolean }) {
  const { userId } = useAuth();
  const [items, setItems] = useState<Array<{ name: string; url: string | null }>>([]);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const list = await listSpecAttachments(userId, workspace, nodeId);
    setLocked(list.locked);
    const next = await Promise.all(
      list.attachments.map(async ({ name }) => ({ name, url: await specAttachmentBlobUrl(userId, workspace, nodeId, name).catch(() => null) })),
    );
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = next.flatMap((item) => (item.url ? [item.url] : []));
    setItems(next);
  }, [userId, workspace, nodeId]);

  useEffect(() => {
    setError(null);
    void load().catch(() => setError("첨부를 불러오지 못했습니다."));
  }, [load]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function add(files: File[]) {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) await uploadSpecAttachment(userId, workspace, nodeId, file);
      await load();
    } catch {
      setError("이미지를 올리지 못했습니다(이미지당 10MB, 최대 20장).");
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!userId) return;
    await deleteSpecAttachment(userId, workspace, nodeId, name).catch(() => setError("삭제하지 못했습니다."));
    await load().catch(() => undefined);
  }

  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">기획 화면</span>
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <ImageThumb key={item.name} src={item.url} label={item.name} onRemove={locked ? undefined : () => void remove(item.name)} />
          ))}
        </div>
      )}
      {!locked && <ImagePasteZone onImages={(files) => void add(files)} disabled={busy} />}
      {!locked && hasSpec && (
        <p className="text-[10.5px] text-[var(--color-text-dim)]">spec.md 작성 뒤에 바꾼 화면은 SPEC을 다시 작성해야 반영됩니다.</p>
      )}
      {error && <p className="text-[10.5px] text-rose-300">{error}</p>}
    </div>
  );
}
