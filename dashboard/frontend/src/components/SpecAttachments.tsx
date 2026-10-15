import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ExternalLink, ImagePlus, Link2, Plus, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext.js";
import { deleteSpecAttachment, listSpecAttachments, listSpecReferences, replaceSpecReferences, specAttachmentBlobUrl, uploadSpecAttachment, type SpecReference } from "../api/roadmapMutationsApi.js";

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
  const [links, setLinks] = useState<SpecReference[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const urls = useRef<string[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const [list, references] = await Promise.all([
      listSpecAttachments(userId, workspace, nodeId),
      listSpecReferences(userId, workspace, nodeId),
    ]);
    setLocked(list.locked || references.locked);
    setLinks(references.links);
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

  async function saveLinks(next: SpecReference[]) {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await replaceSpecReferences(userId, workspace, nodeId, next);
      setLinks(next);
    } catch {
      setError("링크를 저장하지 못했습니다. http(s) 주소인지 확인하세요.");
    } finally {
      setBusy(false);
    }
  }

  function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    let parsed: URL;
    try { parsed = new URL(url); } catch { setError("올바른 링크를 입력하세요."); return; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") { setError("http 또는 https 링크만 추가할 수 있습니다."); return; }
    const title = linkTitle.trim() || parsed.hostname;
    void saveLinks([...links, { title, url }]).then(() => { setLinkTitle(""); setLinkUrl(""); });
  }

  if (locked && items.length === 0 && links.length === 0 && !error) return null;

  const hasReferences = items.length > 0 || links.length > 0;

  return (
    <section className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4" aria-label="기획 참고자료">
      {hasReferences && <div>
        <h3 className="text-[13px] font-semibold text-slate-100">기획 참고자료</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">화면 캡처와 기획 문서를 한곳에서 확인합니다.</p>
      </div>}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {items.map((item) => <ImageThumb key={item.name} src={item.url} label={item.name} onRemove={locked ? undefined : () => void remove(item.name)} />)}
        </div>
      )}
      {links.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
        {links.map((link) => <div key={`${link.title}:${link.url}`} className="group flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <Link2 size={15} className="shrink-0 text-cyan-300" />
          <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-slate-100">{link.title}</span>
            <span className="block truncate text-[10.5px] text-slate-400">{link.url}</span>
          </a>
          <ExternalLink size={13} className="text-slate-500" />
          {!locked && <button type="button" onClick={() => void saveLinks(links.filter((item) => item !== link))} title="링크 삭제" className="text-slate-500 opacity-0 hover:text-rose-300 group-hover:opacity-100"><X size={13} /></button>}
        </div>)}
      </div>}
      {!locked && <div className="grid gap-3 lg:grid-cols-2">
        <ImagePasteZone onImages={(files) => void add(files)} disabled={busy} />
        <div className="flex items-end gap-2 rounded-lg border border-dashed border-white/10 p-2.5">
          <label className="min-w-0 flex-1"><span className="mb-1 block text-[10.5px] font-medium text-slate-300">기획 문서 링크</span><input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addLink(); }} placeholder="https://wiki.example.com/..." className="w-full bg-transparent text-[11.5px] text-slate-100 outline-none placeholder:text-slate-600" /></label>
          <label className="hidden min-w-0 flex-1 sm:block"><span className="mb-1 block text-[10.5px] font-medium text-slate-300">표시 이름</span><input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addLink(); }} placeholder="예: 로그인 정책 위키" className="w-full bg-transparent text-[11.5px] text-slate-100 outline-none placeholder:text-slate-600" /></label>
          <button type="button" disabled={busy || !linkUrl.trim()} onClick={addLink} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-cyan-400/15 px-2.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/25 disabled:opacity-35"><Plus size={13} /> 추가</button>
        </div>
      </div>}
      {!locked && hasSpec && (
        <p className="text-[11px] text-slate-400">SPEC 작성 후 참고자료를 바꾸면 작성 명령을 다시 실행해 반영하세요.</p>
      )}
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </section>
  );
}
