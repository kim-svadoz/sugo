import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { Check, Eye, FileText, LockKeyhole, Pencil, Save } from "lucide-react";
import { getSpecDocument, updateSpecDocument } from "../api/roadmapMutationsApi.js";
import { useAuth } from "../auth/AuthContext.js";
import { Modal } from "./Modal.js";

function safeMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,iframe,object,embed,style,link,meta").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return doc.body.innerHTML;
}

export function SpecDocumentPanel({
  workspace,
  nodeId,
  title,
  onClose,
}: {
  workspace: string;
  nodeId: string;
  title: string;
  onClose: () => void;
}) {
  const { userId } = useAuth();
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [specPath, setSpecPath] = useState("");
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rendered = useMemo(() => safeMarkdown(mode === "edit" ? draft : content), [content, draft, mode]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void getSpecDocument(userId, workspace, nodeId)
      .then((doc) => {
        if (cancelled) return;
        setContent(doc.content);
        setDraft(doc.content);
        setSpecPath(doc.specPath);
        setLocked(doc.locked);
      })
      .catch(() => !cancelled && setError("SPEC 원문을 불러오지 못했습니다. 파일이 이동되거나 삭제되지 않았는지 확인하세요."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userId, workspace, nodeId]);

  async function save() {
    if (!userId || locked || !draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSpecDocument(userId, workspace, nodeId, draft);
      setContent(updated.content);
      setDraft(updated.content);
      setLocked(updated.locked);
      setMode("read");
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setError("저장하지 못했습니다. feat가 시작되어 SPEC이 잠겼는지 확인하세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} size="wide">
      <div className="flex min-h-[66vh] flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-cyan-300" />
              <h2 className="text-lg font-bold text-[var(--color-text-bright)]">{title}</h2>
              {locked && <span className="flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200"><LockKeyhole size={10} /> 읽기 전용</span>}
            </div>
            <p className="mt-1 break-all font-mono text-[10px] text-[var(--color-text-dim)]">{specPath}</p>
          </div>
          {!loading && !error && !locked && (
            <div className="flex rounded-lg border border-[var(--color-border)] p-0.5 text-[11px] font-semibold">
              <button onClick={() => { setMode("read"); setDraft(content); }} className={`flex items-center gap-1 rounded-md px-3 py-1.5 ${mode === "read" ? "bg-cyan-500/15 text-cyan-300" : "text-[var(--color-text-muted)]"}`}><Eye size={12} /> 읽기</button>
              <button onClick={() => setMode("edit")} className={`flex items-center gap-1 rounded-md px-3 py-1.5 ${mode === "edit" ? "bg-violet-500/15 text-violet-200" : "text-[var(--color-text-muted)]"}`}><Pencil size={12} /> 편집</button>
            </div>
          )}
        </div>

        {loading ? <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--color-text-dim)]">SPEC 불러오는 중…</div> : error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-300">{error}</div>
        ) : mode === "edit" && !locked ? (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
            <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} className="ck-scroll min-h-[55vh] resize-none rounded-xl border border-violet-500/30 bg-[#070b12] p-4 font-mono text-[12.5px] leading-6 text-slate-200 outline-none focus:border-violet-400/60" />
            <article className="md-body ck-scroll min-h-[55vh] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5" dangerouslySetInnerHTML={{ __html: rendered }} />
          </div>
        ) : (
          <article className="md-body ck-scroll min-h-[55vh] flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 text-[13px] leading-7" dangerouslySetInnerHTML={{ __html: rendered }} />
        )}

        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
          <p className="text-[10.5px] text-[var(--color-text-dim)]">{error ? "원문을 다시 연결하거나 파일 위치를 확인하세요." : locked ? "feat가 시작되어 원문이 잠겼습니다. 변경은 Patch로 이어가세요." : "저장하면 연결된 spec.md 원문에 즉시 반영됩니다."}</p>
          <div className="flex items-center gap-2">
            {saved && <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400"><Check size={12} /> 저장됨</span>}
            {mode === "edit" && !locked && <button disabled={saving || !draft.trim() || draft === content} onClick={() => void save()} className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-[12px] font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"><Save size={13} /> {saving ? "저장 중…" : "수정 저장"}</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
