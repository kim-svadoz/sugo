import { Check, ChevronDown, CloudSun, MapPin, MonitorCog, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useProfile } from "../hooks/useProfile.js";
import { getWeatherRegion, setWeatherRegion, WEATHER_REGIONS } from "../lib/weatherPreferences.js";
import { cn } from "../lib/utils.js";
import { PageHeading } from "../components/PageHeading.js";

type PreferencesTab = "general" | "weather";

export function Preferences() {
  const { userId } = useAuth();
  const { displayName, saveDisplayName } = useProfile(userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: PreferencesTab = searchParams.get("tab") === "weather" ? "weather" : "general";
  const [selectedRegion, setSelectedRegion] = useState(() => getWeatherRegion()?.id ?? "");
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [regionQuery, setRegionQuery] = useState("");
  const [nickname, setNickname] = useState(displayName);
  const [saved, setSaved] = useState(false);
  useEffect(() => setNickname(displayName), [displayName]);
  const selectTab = (next: PreferencesTab) => setSearchParams(next === "general" ? {} : { tab: next }, { replace: true });
  const currentRegion = WEATHER_REGIONS.find((region) => region.id === selectedRegion);
  const visibleRegions = WEATHER_REGIONS.filter((region) => region.label.toLowerCase().includes(regionQuery.trim().toLowerCase()));

  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeading eyebrow="SYSTEM PREFERENCES" title="시스템 설정" description="이 브라우저에서 사용하는 Sugo의 기본 환경을 설정합니다." />
    <div className="flex gap-1 border-b border-[var(--color-border)]" role="tablist" aria-label="시스템 설정">
      {([['general', '일반', MonitorCog], ['weather', '날씨', CloudSun]] as const).map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => selectTab(id)} className={cn("flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors", tab === id ? "border-cyan-300 text-cyan-200" : "border-transparent text-[var(--color-text-muted)] hover:text-white")}><Icon size={15} />{label}</button>)}
    </div>
    {tab === "general" ? <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-base font-semibold text-slate-100">로컬 환경</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-white/[0.06] bg-black/10 p-4"><label className="text-[11px] font-medium text-slate-400">표시할 이름</label><div className="mt-2 flex gap-2"><input value={nickname} onFocus={() => { if (nickname !== displayName) return; setNickname(displayName); }} onChange={(event) => { setNickname(event.target.value); setSaved(false); }} maxLength={80} className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60" /><button type="button" disabled={!nickname.trim() || nickname.trim() === displayName} onClick={() => void saveDisplayName(nickname.trim()).then(() => setSaved(true))} className="rounded-lg bg-cyan-400/15 px-3 text-xs font-semibold text-cyan-200 disabled:opacity-35">저장</button></div><p className="mt-2 text-[10px] text-slate-500">로그인 ID와 별개인 닉네임입니다. 인사말과 프로필에는 이 이름만 표시됩니다.{saved ? " · 저장됨" : ""}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/10 p-4"><div className="text-[10px] text-slate-500">Console 주소</div><div className="mt-1 font-mono text-sm text-slate-200">localhost:3001</div><div className="mt-2 text-[10px] text-slate-600">계정 ID {userId}</div></div></div>
      <p className="mt-4 text-xs leading-5 text-[var(--color-text-muted)]">Console 화면과 API는 같은 주소를 사용하며, 작업 데이터는 로컬 Sugo 저장소에 유지됩니다.</p>
    </section> : <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-base font-semibold text-[var(--color-text)]">날씨 생활권</h2><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">위치 권한 없이 선택한 생활권의 날씨를 Home에 표시합니다.</p>
      <div className="mt-5 max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/55">
        <button type="button" aria-expanded={regionPickerOpen} onClick={() => setRegionPickerOpen((open) => !open)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300"><MapPin size={17} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-[var(--color-text-muted)]">현재 생활권</span><span className="mt-0.5 block truncate text-sm font-semibold text-[var(--color-text)]">{currentRegion?.label ?? "설정되지 않음"}</span></span>
          <span className="flex items-center gap-2 text-xs font-semibold text-cyan-300">지역 변경<ChevronDown size={15} className={`transition-transform ${regionPickerOpen ? "rotate-180" : ""}`} /></span>
        </button>
        {regionPickerOpen && <div className="border-t border-[var(--color-border)] p-3">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-text-muted)]"><Search size={14} /><input autoFocus value={regionQuery} onChange={(event) => setRegionQuery(event.target.value)} placeholder="도시 또는 지역 검색" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]" /></label>
          <div className="ck-scroll mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
            {visibleRegions.map((region) => <button key={region.id} type="button" onClick={() => { setWeatherRegion(region.id); setSelectedRegion(region.id); setRegionPickerOpen(false); setRegionQuery(""); }} className={cn("flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition", selectedRegion === region.id ? "bg-cyan-400/10 text-cyan-100" : "text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-[var(--color-text)]")}><span>{region.label}</span>{selectedRegion === region.id && <Check size={14} className="shrink-0 text-cyan-300" />}</button>)}
            {visibleRegions.length === 0 && <p className="col-span-full px-3 py-6 text-center text-xs text-[var(--color-text-dim)]">일치하는 지역이 없습니다.</p>}
          </div>
        </div>}
      </div>
      {selectedRegion && <p className="mt-3 text-xs text-emerald-300">Home 날씨에 자동 적용됩니다.</p>}
    </section>}
  </div>;
}
