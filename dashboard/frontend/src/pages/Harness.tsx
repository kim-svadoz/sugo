import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { Boxes, Check, ChevronRight, Layers3, Pencil, RotateCcw, X } from "lucide-react";
import { getHarnessManifest, getHarnessSource, resetHarnessOverride, saveHarnessOverride, type HarnessManifestEntry } from "../api/catalogApi.js";
import { groupHarnessManifest, harnessCategoryLabel, harnessVersion, simplifyHarnessHeading, type HarnessTechnology } from "../lib/harnessCatalog.js";
import { cn } from "../lib/utils.js";
import { PageHeading } from "../components/PageHeading.js";
import { getHarnessFeature } from "../api/harnessFeatureApi.js";
import { NoticeBar } from "../components/NoticeBar.js";
import { useNavigate } from "react-router-dom";

// Harness — unified 마크다운 렌더 + manifest 칩. 데이터는 백엔드 /api/harness(HARNESS_PATH).
export function Harness() {
  const [manifest, setManifest] = useState<HarnessManifestEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState("");
  const [technologyKey, setTechnologyKey] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [customized, setCustomized] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [harnessOff, setHarnessOff] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getHarnessFeature().then((value) => { if (!cancelled) setHarnessOff(!value.enabled); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    getHarnessManifest()
      .then(setManifest)
      .catch(() => setManifest([]))
      .finally(() => setLoaded(true));
  }, []);

  const groups = useMemo(() => groupHarnessManifest(manifest), [manifest]);
  const categories = useMemo(() => [...new Set(groups.map((group) => group.category))], [groups]);
  const visibleGroups = useMemo(() => groups.filter((group) => group.category === category), [groups, category]);
  const selectedTechnology = groups.find((group) => group.key === technologyKey) ?? null;
  const html = useMemo(() => (content ? (marked.parse(simplifyHarnessHeading(content), { async: false }) as string) : ""), [content]);

  useEffect(() => {
    if (!category && categories[0]) setCategory(categories[0]);
  }, [categories, category]);

  useEffect(() => {
    if (!category || visibleGroups.some((group) => group.key === technologyKey)) return;
    setTechnologyKey(visibleGroups[0]?.key ?? "");
  }, [category, technologyKey, visibleGroups]);

  useEffect(() => {
    if (!selectedTechnology || selectedTechnology.versions.some((entry) => entry.id === selectedId)) return;
    const common = selectedTechnology.versions.find((entry) => harnessVersion(entry) === "공통");
    setSelectedId(String((common ?? selectedTechnology.versions[0])?.id ?? ""));
  }, [selectedTechnology, selectedId]);

  useEffect(() => {
    if (!selectedId) return setContent("");
    let cancelled = false;
    setContentLoading(true);
    setEditing(false);
    setConfirmingReset(false);
    getHarnessSource(selectedId)
      .then((value) => { if (!cancelled) { setContent(value.content); setDraft(value.content); setCustomized(value.customized); } })
      .catch(() => !cancelled && setContent(""))
      .finally(() => !cancelled && setContentLoading(false));
    return () => { cancelled = true; };
  }, [selectedId]);

  const empty = loaded && manifest.length === 0;
  const save = async () => {
    setSaving(true);
    try { await saveHarnessOverride(selectedId, draft); setContent(draft); setCustomized(true); setEditing(false); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    setSaving(true);
    try { await resetHarnessOverride(selectedId); const value = await getHarnessSource(selectedId); setContent(value.content); setDraft(value.content); setCustomized(false); setEditing(false); setConfirmingReset(false); }
    finally { setSaving(false); }
  };

  return (
    <div className="harness-page settings-square space-y-3 2xl:space-y-5">
      <PageHeading eyebrow="ENGINEERING HARNESS" title="하네스 규칙" description="기술과 버전에 맞는 검증 규칙을 선택하고, 프로젝트마다 일관된 개발 기준을 적용합니다." />
      {harnessOff && <NoticeBar title="하네스가 꺼져 있어 코드 품질 규칙을 적용하지 않습니다." detail="규칙과 직접 고친 내용은 그대로 남아 있고, 다시 켜면 돌아옵니다." actionLabel="하네스 설정 열기" onAction={() => navigate("/preferences?tab=harness")} />}
      <section className="grid gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.035] p-3 md:grid-cols-3 2xl:p-4" aria-label="하네스 사용 안내">
        {[['01', '기술 선택', '프로젝트에 사용하는 프레임워크·언어·빌드 도구를 고릅니다.'], ['02', '버전 확인', '선택한 기술의 버전에 맞는 기본 규칙을 확인합니다.'], ['03', '프로젝트 적용', '저장한 규칙은 다음 동기화부터 해당 프로젝트의 검증 기준으로 사용됩니다.']].map(([step, title, text]) => <div key={step} className="flex min-w-0 gap-2 max-[1900px]:gap-1.5"><span className="shrink-0 font-mono text-[10px] font-semibold text-cyan-300">{step}</span><div className="min-w-0"><h2 className="text-[13px] font-semibold text-slate-100 max-[1900px]:text-[11px]">{title}</h2><p className="mt-0.5 text-[11px] leading-4 text-slate-400 max-[1900px]:text-[10px] max-[1900px]:leading-[1.45]">{text}</p></div></div>)}
      </section>

      <section aria-label="규칙 선택" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/45 p-3">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-[13px] font-semibold text-[var(--color-text-bright)]">규칙 선택</h2><p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">기술 분류를 선택한 뒤 아래에서 기술과 버전을 지정합니다.</p></div>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="하네스 카테고리">
          {categories.map((key) => (
            <button key={key} role="tab" aria-selected={category === key} onClick={() => setCategory(key)} className={cn("min-w-[108px] rounded-lg border px-4 py-1.5 text-[12px] font-semibold transition-colors", category === key ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-cyan-400/30 hover:text-[var(--color-text)]")}>{harnessCategoryLabel(key)}</button>
          ))}
        </div>
      </section>

      {empty ? (
        <div className="ck-glass ck-card ck-scan space-y-2 text-sm text-slate-300">
          <div className="font-mono text-slate-100">하네스가 설정되지 않았습니다.</div>
          <p className="text-slate-400">
            백엔드 <code style={{ color: "var(--color-primary)" }}>HARNESS_PATH</code>를 플러그인의 <code>sugo/harness-library</code>로 지정하세요.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-[minmax(270px,0.48fr)_minmax(0,2.52fr)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] max-[1900px]:grid-cols-[250px_minmax(0,1fr)]">
          <section className="border-r border-[var(--color-border)] p-3 2xl:p-4">
            <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-dim)]"><Boxes size={13} /> 기술 선택</div>
            <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/35">
              {visibleGroups.map((group) => <TechnologyCard key={group.key} group={group} selected={technologyKey === group.key} onClick={() => setTechnologyKey(group.key)} />)}
            </div>
          </section>
          <section className="grid min-h-0 grid-cols-[96px_minmax(0,1fr)] max-[1900px]:grid-cols-[92px_minmax(0,1fr)] max-md:grid-cols-1">
            <aside className="border-r border-[var(--color-border)] bg-[var(--color-background)]/35 p-3 max-md:border-b max-md:border-r-0 2xl:p-4">
              <div className="mb-3 flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-dim)]"><Layers3 size={12} /> 버전</div>
              <div className="flex flex-col gap-1.5 max-md:flex-row max-md:flex-wrap">
                {selectedTechnology?.versions.map((entry) => <button key={String(entry.id)} aria-pressed={selectedId === entry.id} onClick={() => setSelectedId(String(entry.id))} className={cn("rounded-lg border px-2.5 py-2 text-left font-mono text-[11px] transition-colors max-[1900px]:px-2 max-[1900px]:text-[10px]", selectedId === entry.id ? "border-[var(--color-action-primary)]/60 bg-[var(--color-action-primary)]/10 text-cyan-200" : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]")}>{harnessVersion(entry)}</button>)}
              </div>
            </aside>
            <div className="min-h-0 p-4 2xl:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
                <div className="flex items-center gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px]", customized ? "bg-amber-400/10 text-amber-200" : "bg-emerald-400/10 text-emerald-200")}>{customized ? <Pencil size={11} /> : <Check size={11} />}{customized ? "사용자 규칙 적용 중" : "Sugo 기본 규칙"}</span><span className="text-[11px] text-[var(--color-text-dim)]">다음 프로젝트 동기화부터 반영</span></div>
                <div className="flex items-center gap-2">
                  <button disabled={saving || !customized} onClick={() => { setEditing(false); setConfirmingReset(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-text-muted)] transition-colors hover:border-amber-300/30 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-35"><RotateCcw size={13} /> Sugo 기본값으로 초기화</button>
                  {editing ? <><button onClick={() => { setDraft(content); setEditing(false); }} className="inline-flex items-center gap-1 px-3 py-2 text-[11px] text-[var(--color-text-muted)]"><X size={13} /> 취소</button><button disabled={saving || !draft.trim()} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[11px] font-semibold text-slate-950 disabled:opacity-40"><Check size={13} /> {saving ? "저장 중…" : "규칙 저장"}</button></> : <button onClick={() => { setConfirmingReset(false); setEditing(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/[0.04] px-3 py-2 text-[11px] font-semibold text-cyan-200"><Pencil size={13} /> 규칙 커스터마이징</button>}
                </div>
              </div>
              {confirmingReset && <div role="alertdialog" aria-label="하네스 규칙 초기화 확인" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2.5"><div><p className="text-[12px] font-semibold text-amber-100">사용자 규칙을 삭제하고 Sugo 기본값으로 되돌릴까요?</p><p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">현재 선택한 기술과 버전에만 적용됩니다.</p></div><div className="flex gap-2"><button onClick={() => setConfirmingReset(false)} className="px-2.5 py-1.5 text-[11px] text-[var(--color-text-muted)]">취소</button><button disabled={saving} onClick={reset} className="rounded-md border border-amber-300/30 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100">{saving ? "초기화 중…" : "기본값으로 초기화"}</button></div></div>}
              <div className="ck-scroll h-[clamp(320px,calc(100vh-350px),720px)] min-h-0 overflow-y-auto pr-3">
                {contentLoading ? <div className="py-12 text-center font-mono text-xs text-[var(--color-text-dim)]">규칙을 불러오는 중…</div> : editing ? <div className="flex h-full min-h-[320px] flex-col"><div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold text-[var(--color-text)]">규칙 커스터마이징</p><span className="font-mono text-[9px] text-[var(--color-text-dim)]">MARKDOWN</span></div><textarea autoFocus aria-label="하네스 규칙 편집" value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-[300px] flex-1 resize-y rounded-lg border border-cyan-400/25 bg-[var(--color-background)] p-4 font-mono text-[12px] leading-5 text-[var(--color-text)] outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10" /></div> : html ? <article className="md-body harness-rule-body" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">표시할 하네스 본문이 없습니다.</div>}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function TechnologyCard({ group, selected, onClick }: { group: HarnessTechnology; selected: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-pressed={selected} className={cn("group flex min-h-12 w-full min-w-0 items-center justify-between gap-2 border-l-2 px-3 py-2.5 text-left transition-colors", selected ? "border-l-cyan-300 bg-cyan-400/[0.07]" : "border-l-transparent hover:bg-cyan-400/[0.025]")}><span className={cn("min-w-0 truncate text-[13px] font-semibold capitalize", selected ? "text-cyan-100" : "text-[var(--color-text)]")}>{group.technology}</span><ChevronRight size={14} className={cn("shrink-0 transition-transform", selected ? "translate-x-0.5 text-cyan-300" : "text-[var(--color-text-dim)] group-hover:translate-x-0.5")} /></button>;
}
