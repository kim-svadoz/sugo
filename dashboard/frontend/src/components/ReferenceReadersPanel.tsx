import { useEffect, useState } from "react";
import { BookOpenText, Plus, Trash2 } from "lucide-react";
import { getReferenceReaders, saveReferenceReaders, type ReferenceReader } from "../api/referenceReadersApi.js";

export function ReferenceReadersPanel() {
  const [readers, setReaders] = useState<ReferenceReader[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getReferenceReaders().then((value) => { if (!cancelled) setReaders(value.readers); }).catch(() => { if (!cancelled) setError("기획 문서 설정을 불러오지 못했습니다."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const update = (id: string, key: "urlPrefix" | "mcpServer", value: string) => {
    setReaders((current) => current.map((reader) => reader.id === id ? { ...reader, [key]: value } : reader));
    setSaved(false);
  };
  const valid = readers.every((reader) => {
    try { return ["http:", "https:"].includes(new URL(reader.urlPrefix).protocol) && !!reader.mcpServer.trim(); } catch { return false; }
  });

  return <section>
    <div className="integration-panel-header flex items-center gap-2.5 border-b border-[var(--color-border)]">
      <span className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300/20 text-[var(--color-primary)]"><BookOpenText size={17} /></span>
      <div><h2 className="text-xl font-semibold text-[var(--color-text)]">기획 문서</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">SPEC 링크를 읽을 MCP 서버를 주소 범위별로 지정합니다.</p></div>
    </div>
    <div className="integration-panel-body space-y-6">
      <div className="border-y border-cyan-300/15 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-[var(--color-text-muted)]"><strong className="text-cyan-100">주소 범위는 읽기 권한이 아니라 연결 규칙입니다.</strong> 이 주소로 시작하는 하위 링크를 지정한 MCP로 전달합니다. 실제 열람 범위는 해당 MCP의 설치·로그인·접근 권한에 따라 달라집니다.</div>
      <div className="flex items-end justify-between gap-4">
        <div><h3 className="text-sm font-semibold text-[var(--color-text)]">문서 연결 규칙</h3><p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">Claude Code 또는 Codex에 MCP를 먼저 연결한 뒤, 등록된 서버 이름을 그대로 입력합니다.</p></div>
        <button type="button" onClick={() => { setReaders((current) => [...current, { id: crypto.randomUUID(), urlPrefix: "", mcpServer: "" }]); setSaved(false); }} className="settings-action settings-action-secondary settings-action-compact"><Plus size={14} /> 규칙 추가</button>
      </div>
      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {readers.map((reader) => <div key={reader.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(12rem,0.8fr)_auto] md:items-end">
          <label className="text-xs text-[var(--color-text-muted)]"><span className="mb-2 block">문서 주소 범위</span><input value={reader.urlPrefix} onChange={(event) => update(reader.id, "urlPrefix", event.target.value)} placeholder="https://docs.example.com/team/" className="settings-field w-full font-mono" /><span className="mt-1.5 block text-[10px] text-[var(--color-text-dim)]">이 주소로 시작하는 모든 링크에 적용</span></label>
          <label className="text-xs text-[var(--color-text-muted)]"><span className="mb-2 block">MCP 서버 이름</span><input value={reader.mcpServer} onChange={(event) => update(reader.id, "mcpServer", event.target.value)} placeholder="team-docs" className="settings-field w-full font-mono" /><span className="mt-1.5 block text-[10px] text-[var(--color-text-dim)]">MCP 설정에 등록된 이름과 정확히 일치</span></label>
          <button type="button" aria-label="기획 문서 연결 규칙 삭제" onClick={() => { setReaders((current) => current.filter((item) => item.id !== reader.id)); setSaved(false); }} className="settings-action settings-action-secondary px-3"><Trash2 size={14} /></button>
        </div>)}
        {!loading && readers.length === 0 && <p className="py-8 text-center text-xs text-[var(--color-text-dim)]">등록된 문서 연결 규칙이 없습니다.</p>}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex items-center gap-3"><button type="button" disabled={!valid || saving || loading} onClick={() => { setSaving(true); setError(""); void saveReferenceReaders(readers).then((value) => { setReaders(value.readers); setSaved(true); }).catch(() => setError("기획 문서 설정을 저장하지 못했습니다.")).finally(() => setSaving(false)); }} className="settings-action settings-action-primary settings-action-compact">{saving ? "저장 중…" : "설정 저장"}</button>{saved && <span className="text-[11px] text-emerald-300">저장됨</span>}</div>
      <p className="text-[11px] leading-5 text-[var(--color-text-dim)]">spec-writer가 링크 본문을 읽어 spec.md에 고정합니다. feat는 확정된 SPEC을 사용하고, patch는 당시 SPEC과 완료 결과를 이어받아 원문을 임의로 다시 읽지 않습니다. MCP를 찾지 못하거나 문서를 읽지 못하면 작업을 완료하지 않고 원문을 요청합니다.</p>
    </div>
  </section>;
}
