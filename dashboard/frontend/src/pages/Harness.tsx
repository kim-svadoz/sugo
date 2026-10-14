import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { Boxes, ChevronRight, Layers3 } from "lucide-react";
import { getHarnessContent, getHarnessManifest, type HarnessManifestEntry } from "../api/catalogApi.js";
import { groupHarnessManifest, harnessCategoryLabel, harnessVersion, simplifyHarnessHeading, type HarnessTechnology } from "../lib/harnessCatalog.js";
import { cn } from "../lib/utils.js";

// §5 Harness — unified 마크다운 렌더 + manifest 칩. 데이터는 백엔드 /api/harness(HARNESS_PATH).
export function Harness() {
  const [manifest, setManifest] = useState<HarnessManifestEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState("");
  const [technologyKey, setTechnologyKey] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);

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
    getHarnessContent(selectedId)
      .then((value) => !cancelled && setContent(value))
      .catch(() => !cancelled && setContent(""))
      .finally(() => !cancelled && setContentLoading(false));
    return () => { cancelled = true; };
  }, [selectedId]);

  const empty = loaded && manifest.length === 0;

  return (
    <div className="space-y-6">
      {/* 설계안 Harness 헤더 — 제목 + 부제. */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-bright)]">Harness</h1>
        <p className="text-[var(--color-text-muted)]">카테고리에서 기술을 고르고, 마지막에 버전별 규칙을 확인합니다.</p>
      </div>

      {empty ? (
        <div className="ck-glass ck-card ck-scan space-y-2 text-sm text-slate-300">
          <div className="font-mono text-slate-100">하네스가 설정되지 않았습니다.</div>
          <p className="text-slate-400">
            백엔드 <code style={{ color: "var(--color-primary)" }}>HARNESS_PATH</code>를 플러그인의 <code>sugo/harness-library</code>로 지정하세요.
          </p>
        </div>
      ) : (
        <div className="grid min-h-[calc(100vh-210px)] grid-cols-[minmax(0,1fr)_minmax(0,2fr)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] max-xl:grid-cols-1">
          <section className="border-r border-[var(--color-border)] p-6 max-xl:border-b max-xl:border-r-0">
            <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="하네스 카테고리">
              {categories.map((key) => (
                <button key={key} role="tab" aria-selected={category === key} onClick={() => setCategory(key)} className={cn("rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors", category === key ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-cyan-400/30 hover:text-[var(--color-text)]")}>{harnessCategoryLabel(key)}<span className="ml-2 font-mono text-[10px] opacity-60">{groups.filter((group) => group.category === key).length}</span></button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-dim)]"><Boxes size={14} /> 기술 선택</div>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              {visibleGroups.map((group) => <TechnologyCard key={group.key} group={group} selected={technologyKey === group.key} onClick={() => setTechnologyKey(group.key)} />)}
            </div>
          </section>
          <section className="grid min-h-0 grid-cols-[150px_minmax(0,1fr)] max-md:grid-cols-1">
            <aside className="border-r border-[var(--color-border)] bg-[var(--color-background)]/35 p-4 max-md:border-b max-md:border-r-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-dim)]"><Layers3 size={13} /> 버전</div>
              <div className="flex flex-col gap-1.5 max-md:flex-row max-md:flex-wrap">
                {selectedTechnology?.versions.map((entry) => <button key={String(entry.id)} aria-pressed={selectedId === entry.id} onClick={() => setSelectedId(String(entry.id))} className={cn("rounded-lg border px-3 py-2 text-left font-mono text-xs transition-colors", selectedId === entry.id ? "border-[var(--color-action-primary)]/60 bg-[var(--color-action-primary)]/10 text-cyan-200" : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]")}>{harnessVersion(entry)}</button>)}
              </div>
            </aside>
            <div className="min-h-0 p-6">
              <div className="ck-scroll h-[calc(100vh-350px)] min-h-[360px] overflow-y-auto pr-3">
                {contentLoading ? <div className="py-12 text-center font-mono text-sm text-[var(--color-text-dim)]">규칙을 불러오는 중…</div> : html ? <article className="md-body" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">표시할 하네스 본문이 없습니다.</div>}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function TechnologyCard({ group, selected, onClick }: { group: HarnessTechnology; selected: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={cn("group flex min-h-24 items-center justify-between rounded-xl border p-4 text-left transition-all", selected ? "-translate-y-0.5 border-cyan-400/60 bg-cyan-400/[0.07] shadow-[0_0_24px_rgba(34,211,238,0.08)]" : "border-[var(--color-border)] bg-[var(--color-background)]/50 hover:border-cyan-400/30 hover:bg-cyan-400/[0.03]")}><span><span className="block text-base font-semibold capitalize text-[var(--color-text-bright)]">{group.technology}</span><span className="mt-1 block font-mono text-[11px] text-[var(--color-text-dim)]">{group.versions.length}개 규칙 세트</span></span><ChevronRight size={18} className={cn("transition-transform", selected ? "translate-x-1 text-cyan-300" : "text-[var(--color-text-dim)] group-hover:translate-x-1")} /></button>;
}
