import { useEffect, useState } from "react";
import { BookOpenText, Check, Circle, CircleAlert, Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { getReferenceReaders, previewReferenceReaders, saveReferenceReaders, testReferenceReader, type ReferenceReader, type WikiSetupStatus } from "../api/referenceReadersApi.js";

type StepState = "complete" | "required" | "unknown" | "blocked" | "missing" | "pending";

function StepStatus({ state, label }: { state: StepState; label: string }) {
  const complete = state === "complete";
  const attention = state === "required" || state === "unknown" || state === "pending";
  const Icon = complete ? Check : attention ? CircleAlert : Circle;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${complete ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : attention ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-200" : "border-white/10 bg-white/[0.025] text-[var(--color-text-dim)]"}`}><Icon size={11} />{label}</span>;
}

export function ReferenceReadersPanel() {
  const [readers, setReaders] = useState<ReferenceReader[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"claude" | "codex" | null>(null);
  const [setup, setSetup] = useState<WikiSetupStatus>({ registration: "missing", authentication: "blocked", clients: [] });
  const [routeSaved, setRouteSaved] = useState(false);
  const [routeDirty, setRouteDirty] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pendingNormalized, setPendingNormalized] = useState<ReferenceReader[] | null>(null);
  const [testUrl, setTestUrl] = useState("");
  const [testMatch, setTestMatch] = useState<ReferenceReader | null>(null);
  const [testPending, setTestPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReferenceReaders().then((value) => { if (!cancelled) { setReaders(value.readers); setSetup(value.setup); setRouteSaved(value.readers.some((reader) => reader.mcpServer === "atlassian")); } }).catch(() => { if (!cancelled) setError("WIKI 연동 설정을 불러오지 못했습니다."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const update = (id: string, key: "urlPrefix" | "mcpServer", value: string) => {
    setReaders((current) => current.map((reader) => reader.id === id ? { ...reader, [key]: value } : reader));
    setSaved(false);
    setRouteDirty(true);
    setPendingNormalized(null);
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

  const refreshSetup = async () => {
    setChecking(true);
    setError("");
    try {
      const value = await getReferenceReaders();
      setSetup(value.setup);
      setRouteSaved(value.readers.some((reader) => reader.mcpServer === "atlassian"));
    } catch {
      setError("WIKI 연동 상태를 확인하지 못했습니다.");
    } finally {
      setChecking(false);
    }
  };

  const addAtlassianRule = () => {
    setReaders((current) => {
      const existing = current.find((reader) => reader.mcpServer === "atlassian" && reader.urlPrefix.includes(".atlassian.net/"));
      let urlPrefix = "https://{site}.atlassian.net/wiki/";
      if (existing) {
        try { urlPrefix = `${new URL(existing.urlPrefix).origin}/wiki/`; } catch { /* keep the editable default */ }
      }
      return [...current, { id: crypto.randomUUID(), urlPrefix, mcpServer: "atlassian" }];
    });
    setSaved(false);
    setRouteDirty(true);
    setPendingNormalized(null);
  };

  useEffect(() => {
    const value = testUrl.trim();
    if (!value || !valid) {
      setTestMatch(null);
      setTestPending(false);
      return;
    }
    let cancelled = false;
    setTestPending(true);
    const timer = window.setTimeout(() => {
      void testReferenceReader(value, readers)
        .then((result) => { if (!cancelled) setTestMatch(result.match); })
        .catch(() => { if (!cancelled) setTestMatch(null); })
        .finally(() => { if (!cancelled) setTestPending(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [readers, testUrl, valid]);

  const persistReaders = async (value: ReferenceReader[]) => {
    setSaving(true);
    setError("");
    try {
      const result = await saveReferenceReaders(value);
      setReaders(result.readers);
      setSaved(true);
      setRouteSaved(result.readers.some((reader) => reader.mcpServer === "atlassian"));
      setRouteDirty(false);
      setPendingNormalized(null);
    } catch {
      setError("WIKI 연동 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const requestSave = async () => {
    if (pendingNormalized) {
      await persistReaders(pendingNormalized);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const preview = await previewReferenceReaders(readers);
      if (preview.changed) {
        setPendingNormalized(preview.readers);
        return;
      }
    } catch {
      setError("WIKI 주소 범위를 확인하지 못했습니다.");
      return;
    } finally {
      setSaving(false);
    }
    await persistReaders(readers);
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
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void refreshSetup()} disabled={checking} className="settings-action settings-action-secondary settings-action-compact">{checking ? "확인 중…" : "상태 확인"}</button><a href="https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/" target="_blank" rel="noreferrer" className="settings-action settings-action-secondary settings-action-compact">공식 안내 <ExternalLink size={13} /></a></div>
        </div>
        <ol className="mt-5 grid gap-3 lg:grid-cols-3">
          <li className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] tracking-[0.16em] text-cyan-300">01 · CONNECT</span><StepStatus state={setup.registration} label={setup.registration === "complete" ? `${setup.clients.map((client) => client === "claude" ? "Claude" : "Codex").join(" · ")} 등록됨` : "등록 필요"} /></div>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">MCP 등록</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyCommand("claude")} className="settings-action settings-action-secondary settings-action-compact">{copied === "claude" ? <Check size={13} /> : <Copy size={13} />} Claude Code</button>
              <button type="button" onClick={() => void copyCommand("codex")} className="settings-action settings-action-secondary settings-action-compact">{copied === "codex" ? <Check size={13} /> : <Copy size={13} />} Codex</button>
            </div>
          </li>
          <li className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] tracking-[0.16em] text-cyan-300">02 · AUTHORIZE</span><StepStatus state={setup.authentication} label={setup.authentication === "complete" ? "인증 완료" : setup.authentication === "required" ? "로그인 필요" : setup.authentication === "unknown" ? "로그인 확인 필요" : "MCP 등록 후 확인"} /></div>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">Atlassian 로그인</p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">Claude Code에서는 세션을 연 뒤 <code className="font-mono text-cyan-100">/mcp</code>를 실행하고 Atlassian 인증을 완료합니다.</p>
          </li>
          <li className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] tracking-[0.16em] text-cyan-300">03 · ROUTE</span><StepStatus state={routeDirty ? "pending" : routeSaved ? "complete" : "missing"} label={routeDirty ? "변경 저장 필요" : routeSaved ? "주소 등록됨" : "주소 등록 필요"} /></div>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">WIKI 주소 등록</p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">Confluence 주소 범위와 서버 이름 <code className="font-mono text-cyan-100">atlassian</code>을 아래 규칙으로 저장합니다.</p>
          </li>
        </ol>
      </section>
      <div className="border-y border-cyan-300/15 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-[var(--color-text-muted)]"><strong className="text-cyan-100">주소 범위는 권한이 아니라 라우팅 규칙입니다.</strong> 하위 링크는 같은 MCP로 전달되지만, 실제 열람 범위는 로그인한 계정의 WIKI 권한으로 결정됩니다.</div>
      <div className="flex items-end justify-between gap-4">
        <div><h3 className="text-sm font-semibold text-[var(--color-text)]">WIKI 주소 규칙</h3><p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">다른 WIKI MCP도 등록된 서버 이름으로 연결할 수 있습니다.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={addAtlassianRule} className="settings-action settings-action-primary settings-action-compact"><Plus size={14} /> Confluence 규칙</button><button type="button" onClick={() => { setReaders((current) => [...current, { id: crypto.randomUUID(), urlPrefix: "", mcpServer: "" }]); setSaved(false); setRouteDirty(true); }} className="settings-action settings-action-secondary settings-action-compact"><Plus size={14} /> 직접 추가</button></div>
      </div>
      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {readers.map((reader) => <div key={reader.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(12rem,0.8fr)_auto] md:items-end">
          <label className="text-xs text-[var(--color-text-muted)]"><span className="mb-2 block">WIKI 주소 범위</span><input value={reader.urlPrefix} onChange={(event) => update(reader.id, "urlPrefix", event.target.value)} placeholder="https://team.atlassian.net/wiki/" className="settings-field w-full font-mono" /><span className="mt-1.5 block text-[10px] text-[var(--color-text-dim)]">같은 호스트와 이 경로 아래의 링크에 적용</span></label>
          <label className="text-xs text-[var(--color-text-muted)]"><span className="mb-2 block">MCP 서버 이름</span><input value={reader.mcpServer} onChange={(event) => update(reader.id, "mcpServer", event.target.value)} placeholder="team-docs" className="settings-field w-full font-mono" /><span className="mt-1.5 block text-[10px] text-[var(--color-text-dim)]">MCP 설정에 등록된 이름과 정확히 일치</span></label>
          <button type="button" aria-label="WIKI 연결 규칙 삭제" onClick={() => { setReaders((current) => current.filter((item) => item.id !== reader.id)); setSaved(false); setRouteDirty(true); }} className="settings-action settings-action-secondary px-3"><Trash2 size={14} /></button>
        </div>)}
        {!loading && readers.length === 0 && <p className="py-8 text-center text-xs text-[var(--color-text-dim)]">등록된 문서 연결 규칙이 없습니다.</p>}
      </div>
      {pendingNormalized && <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
        <p className="text-xs font-semibold text-amber-100">주소 범위를 아래 값으로 정리해 저장합니다.</p>
        <div className="mt-3 space-y-2">{pendingNormalized.map((reader, index) => readers[index]?.urlPrefix !== reader.urlPrefix && <div key={reader.id} className="grid gap-1 font-mono text-[10px] leading-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center"><span className="truncate text-[var(--color-text-dim)]">{readers[index]?.urlPrefix}</span><span className="text-amber-200">→</span><span className="truncate text-amber-100">{reader.urlPrefix}</span></div>)}</div>
      </div>}
      <section className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
        <label className="text-xs text-[var(--color-text-muted)]"><span className="mb-2 block font-semibold text-[var(--color-text)]">링크 테스트</span><input value={testUrl} onChange={(event) => setTestUrl(event.target.value)} placeholder="확인할 WIKI 링크를 붙여 넣으세요" className="settings-field w-full font-mono" /></label>
        {testUrl.trim() && <div className="mt-3 text-xs">{testPending ? <span className="text-[var(--color-text-dim)]">확인 중…</span> : testMatch ? <span className="text-emerald-200"><strong>{testMatch.mcpServer}</strong> · {testMatch.urlPrefix}</span> : <span className="text-amber-200">매칭되는 규칙 없음</span>}</div>}
      </section>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex items-center gap-3"><button type="button" disabled={!valid || saving || loading} onClick={() => void requestSave()} className="settings-action settings-action-primary settings-action-compact">{saving ? "저장 중…" : pendingNormalized ? "정리된 주소로 저장" : "설정 저장"}</button>{saved && <span className="text-[11px] text-emerald-300">저장됨</span>}</div>
      <p className="text-[11px] leading-5 text-[var(--color-text-dim)]">spec-writer가 링크 본문을 읽어 spec.md에 고정합니다. feat는 확정된 SPEC을 사용하고, patch는 당시 SPEC과 완료 결과를 이어받아 원문을 임의로 다시 읽지 않습니다. MCP를 찾지 못하거나 문서를 읽지 못하면 작업을 완료하지 않고 원문을 요청합니다.</p>
    </div>
  </section>;
}
