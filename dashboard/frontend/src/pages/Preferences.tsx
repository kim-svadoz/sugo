import { CloudSun, MonitorCog } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useProfile } from "../hooks/useProfile.js";
import { getWeatherRegion, setWeatherRegion, WEATHER_REGIONS } from "../lib/weatherPreferences.js";
import { cn } from "../lib/utils.js";

type PreferencesTab = "general" | "weather";

export function Preferences() {
  const { userId } = useAuth();
  const { displayName, saveDisplayName } = useProfile(userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: PreferencesTab = searchParams.get("tab") === "weather" ? "weather" : "general";
  const [selectedRegion, setSelectedRegion] = useState(() => getWeatherRegion()?.id ?? "");
  const [nickname, setNickname] = useState(displayName);
  const [saved, setSaved] = useState(false);
  useEffect(() => setNickname(displayName), [displayName]);
  const selectTab = (next: PreferencesTab) => setSearchParams(next === "general" ? {} : { tab: next }, { replace: true });

  return <div className="mx-auto max-w-5xl space-y-5">
    <div><div className="font-mono text-[10px] font-semibold tracking-[0.16em] text-cyan-300">SYSTEM PREFERENCES</div><h1 className="mt-2 text-2xl font-semibold text-[var(--color-text-bright)]">시스템 설정</h1><p className="mt-1 text-sm text-[var(--color-text-muted)]">이 브라우저에서 사용하는 Sugo의 기본 환경을 설정합니다.</p></div>
    <div className="flex gap-1 border-b border-[var(--color-border)]" role="tablist" aria-label="시스템 설정">
      {([['general', '일반', MonitorCog], ['weather', '날씨', CloudSun]] as const).map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => selectTab(id)} className={cn("flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors", tab === id ? "border-cyan-300 text-cyan-200" : "border-transparent text-[var(--color-text-muted)] hover:text-white")}><Icon size={15} />{label}</button>)}
    </div>
    {tab === "general" ? <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-base font-semibold text-slate-100">로컬 환경</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-white/[0.06] bg-black/10 p-4"><label className="text-[11px] font-medium text-slate-400">표시할 이름</label><div className="mt-2 flex gap-2"><input value={nickname} onFocus={() => { if (nickname !== displayName) return; setNickname(displayName); }} onChange={(event) => { setNickname(event.target.value); setSaved(false); }} maxLength={80} className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60" /><button type="button" disabled={!nickname.trim() || nickname.trim() === displayName} onClick={() => void saveDisplayName(nickname.trim()).then(() => setSaved(true))} className="rounded-lg bg-cyan-400/15 px-3 text-xs font-semibold text-cyan-200 disabled:opacity-35">저장</button></div><p className="mt-2 text-[10px] text-slate-500">로그인 ID와 별개인 닉네임입니다. 인사말과 프로필에는 이 이름만 표시됩니다.{saved ? " · 저장됨" : ""}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/10 p-4"><div className="text-[10px] text-slate-500">Console 주소</div><div className="mt-1 font-mono text-sm text-slate-200">localhost:3001</div><div className="mt-2 text-[10px] text-slate-600">계정 ID {userId}</div></div></div>
      <p className="mt-4 text-xs leading-5 text-[var(--color-text-muted)]">Console 화면과 API는 같은 주소를 사용하며, 작업 데이터는 로컬 Sugo 저장소에 유지됩니다.</p>
    </section> : <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-base font-semibold text-slate-100">Home 기준 위치</h2><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">위치 권한은 요청하지 않습니다. 생활권과 가장 가까운 대표 도시를 선택하면 그 지점의 날씨를 사용합니다.</p>
      <label className="mt-5 block max-w-md text-xs font-medium text-slate-300">대표 도시<select value={selectedRegion} onChange={(event) => { setWeatherRegion(event.target.value); setSelectedRegion(event.target.value); }} className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-slate-100"><option value="" disabled>가까운 도시를 선택하세요</option>{WEATHER_REGIONS.map((region) => <option key={region.id} value={region.id}>{region.label}</option>)}</select></label>
      {selectedRegion && <p className="mt-3 text-xs text-emerald-300">현재 설정: {getWeatherRegion()?.label} · 자동 적용됨</p>}
    </section>}
  </div>;
}
