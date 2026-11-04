import { useEffect, useState } from "react";
import { BookOpenText, Check, Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { getReferenceReaders, saveReferenceReaders, type ReferenceReader } from "../api/referenceReadersApi.js";

export function ReferenceReadersPanel() {
  const [readers, setReaders] = useState<ReferenceReader[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"claude" | "codex" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReferenceReaders().then((value) => { if (!cancelled) setReaders(value.readers); }).catch(() => { if (!cancelled) setError("WIKI 연동 설정을 불러오지 못했습니다."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const update = (id: string, key: "urlPrefix" | "mcpServer", value: string) => {
    setReaders((current) => current.map((reader) => reader.id === id ? { ...reader, [key]: value } : reader));
    setSaved(false);
  };
  const valid = readers.every((reader) => {
    try { return ["http:", "https:"].includes(new URL(reader.urlPrefix).protocol) && !!reader.mcpServer.trim(); } catch { return false; }
  });

  const copyCommand = async (client: "claude" | "codex") => {
    const command = client === "claude"
      ? "claude mcp add --transport http --scope user atlassian https://mcp.atlassian.com/v2/mcp"
      : "codex mcp add atlassian --url https://mcp.atlassian.com/v2/mcp";
    try {
      await navigator.clipboard.writeText(command);
      setCopied(client);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("연결 명령을 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인하세요.");
    }
  };

  const addAtlassianRule = () => {
    setReaders((current) => [...current, { id: crypto.randomUUID(), urlPrefix: "", mcpServer: "atlassian" }]);
    setSaved(false);
  };

  return <section>
    <div className="integration-panel-header flex items-center gap-2.5 border-b border-[var(--color-border)]">
      <span className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300/20 text-[var(--color-primary)]"><BookOpenText size={17} /></span>
      <div><h2 className="text-xl font-semibold text-[var(--color-text)]">WIKI 연동</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">WIKI를 연결하고 SPEC 링크를 읽을 MCP를 지정합니다.</p></div>
    </div>
    <div className="integration-panel-body space-y-6">
      <section aria-labelledby="atlassian-connect-title" className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.025] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-300">ATLASSIAN CLOUD</p>
            <h3 id="atlassian-connect-title" className="mt-2 text-base font-semibold text-[var(--color-text)]">Confluence를 먼저 연결하세요</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">공식 Atlassian MCP를 한 번 등록한 뒤 OAuth로 로그인합니다. 어느 프로젝트에서든 기존 Confluence 권한 범위 안에서 문서를 읽습니다.</p>
          </div>
          <a href="https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/" target="_blank" rel="noreferrer" className="settings-action settings-action-secondary settings-action-compact">공식 안내 <ExternalLink size={13} /></a>
        </div>
        <ol className="mt-5 grid gap-3 lg:grid-cols-3">
          <li className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
            <span className="font-mono text-[10px] tracking-[0.16em] text-cyan-300">01 · CONNECT</span>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">MCP 등록</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyCommand("claude")} className="settings-action settings-action-secondary settings-action-compact">{copied === "claude" ? <Check size={13} /> : <Copy size={13} />} Claude Code</button>
              <button type="button" onClick={() => void copyCommand("codex")} className="settings-action settings-action-secondary settings-action-compact">{copied === "codex" ? <Check size={13} /> : <Copy size={13} />} Codex</button>
            </div>
          </li>
          <li className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
            <span className="font-mono text-[10px] tracking-[0.16em] text-cyan-300">02 · AUTHORIZE</span>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">Atlassian 로그인</p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">Claude Code에서는 세션을 연 뒤 <code className="font-mono text-cyan-100">/mcp</code>를 실행하고 Atlassian 인증을 완료합니다.</p>
          </li>
          <li className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
            <span className="font-mono text-[10px] tracking-[0.16em] text-cyan-300">03 · ROUTE</span>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">WIKI 주소 등록</p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">Confluence 주소 범위와 서버 이름 <code className="font-mono text-cyan-100">atlassian</code>을 아래 규칙으로 저장합니다.</p>
          </li>
        </ol>
      </section>
      <div className="border-y border-cyan-300/15 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-[var(--color-text-muted)]"><strong className="text-cyan-100">주소 범위는 권한이 아니라 라우팅 규칙입니다.</strong> 하위 링크는 같은 MCP로 전달되지만, 실제 열람 범위는 로그인한 계정의 WIKI 권한으로 결정됩니다.</div>
      <div className="flex items-end justify-between gap-4">
        <div><h3 className="text-sm font-semibold text-[var(--color-text)]">WIKI 주소 규칙</h3><p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">다른 WIKI MCP도 등록된 서버 이름으로 연결할 수 있습니다.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={addAtlassianRule} className="settings-action settings-action-primary settings-action-compact"><Plus size={14} /> Confluence 규칙</button><button type="button" onClick={() => { setReaders((current) => [...current, { id: crypto.randomUUID(), urlPrefix: "", mcpServer: "" }]); setSaved(false); }} className="settings-action settings-action-secondary settings-action-compact"><Plus size={14} /> 직접 추가</button></div>
      </div>
      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {readers.map((reader) => <div key={reader.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(12rem,0.8fr)_auto] md:items-end">
          <label className="text-xs text-[var(--color-text-muted)]"><span className="mb-2 block">WIKI 주소 범위</span><input value={reader.urlPrefix} onChange={(event) => update(reader.id, "urlPrefix", event.target.value)} placeholder="https://team.atlassian.net/wiki/" className="settings-field w-full font-mono" /><span className="mt-1.5 block text-[10px] text-[var(--color-text-dim)]">이 주소로 시작하는 모든 링크에 적용</span></label>
          <label className="text-xs text-[var(--color-text-muted)]"><span className="mb-2 block">MCP 서버 이름</span><input value={reader.mcpServer} onChange={(event) => update(reader.id, "mcpServer", event.target.value)} placeholder="team-docs" className="settings-field w-full font-mono" /><span className="mt-1.5 block text-[10px] text-[var(--color-text-dim)]">MCP 설정에 등록된 이름과 정확히 일치</span></label>
          <button type="button" aria-label="WIKI 연결 규칙 삭제" onClick={() => { setReaders((current) => current.filter((item) => item.id !== reader.id)); setSaved(false); }} className="settings-action settings-action-secondary px-3"><Trash2 size={14} /></button>
        </div>)}
        {!loading && readers.length === 0 && <p className="py-8 text-center text-xs text-[var(--color-text-dim)]">등록된 문서 연결 규칙이 없습니다.</p>}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex items-center gap-3"><button type="button" disabled={!valid || saving || loading} onClick={() => { setSaving(true); setError(""); void saveReferenceReaders(readers).then((value) => { setReaders(value.readers); setSaved(true); }).catch(() => setError("WIKI 연동 설정을 저장하지 못했습니다.")).finally(() => setSaving(false)); }} className="settings-action settings-action-primary settings-action-compact">{saving ? "저장 중…" : "설정 저장"}</button>{saved && <span className="text-[11px] text-emerald-300">저장됨</span>}</div>
      <p className="text-[11px] leading-5 text-[var(--color-text-dim)]">spec-writer가 링크 본문을 읽어 spec.md에 고정합니다. feat는 확정된 SPEC을 사용하고, patch는 당시 SPEC과 완료 결과를 이어받아 원문을 임의로 다시 읽지 않습니다. MCP를 찾지 못하거나 문서를 읽지 못하면 작업을 완료하지 않고 원문을 요청합니다.</p>
    </div>
  </section>;
}
