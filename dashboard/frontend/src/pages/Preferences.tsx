import { CalendarClock, Check, ChevronDown, CloudSun, Copy, KeyRound, MapPin, MonitorCog, PlugZap, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useProfile } from "../hooks/useProfile.js";
import { getWeatherRegion, setWeatherRegion, WEATHER_REGIONS } from "../lib/weatherPreferences.js";
import { cn } from "../lib/utils.js";
import { PageHeading } from "../components/PageHeading.js";
import { IntegrationFeaturesPanel } from "../components/IntegrationFeaturesPanel.js";
import { deleteWeeklyToken, getWeeklySettings, saveWeeklySettings, type WeeklySettingsInput } from "../api/weeklyApi.js";
import { HarnessFeaturePanel } from "../components/HarnessFeaturePanel.js";

type PreferencesTab = "general" | "harness" | "integrations" | "weekly" | "weather";

export function Preferences() {
  const { userId } = useAuth();
  const { displayName, saveDisplayName } = useProfile(userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: PreferencesTab = requestedTab === "harness" || requestedTab === "integrations" || requestedTab === "weekly" || requestedTab === "weather" ? requestedTab : "general";
  const [selectedRegion, setSelectedRegion] = useState(() => getWeatherRegion()?.id ?? "");
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [regionQuery, setRegionQuery] = useState("");
  const [nickname, setNickname] = useState(displayName);
  const [saved, setSaved] = useState(false);
  const [weekly, setWeekly] = useState<WeeklySettingsInput>({ enabled: false, weekday: 5, hour: 17, minute: 0, model: "default", extraRepositories: [] });
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [weeklyError, setWeeklyError] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [token, setToken] = useState("");
  const [repositoryDraft, setRepositoryDraft] = useState("");
  const [weeklySaved, setWeeklySaved] = useState(false);
  useEffect(() => setNickname(displayName), [displayName]);
  useEffect(() => {
    let cancelled = false;
    getWeeklySettings().then((value) => { if (!cancelled) { setWeekly({ enabled: value.enabled, weekday: value.weekday, hour: value.hour, minute: value.minute, model: value.model, extraRepositories: value.extraRepositories }); setTokenConfigured(value.tokenConfigured); setWeeklyLoading(false); } }).catch(() => { if (!cancelled) { setWeeklyError("주간 리포트 설정을 불러오지 못했습니다."); setWeeklyLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  const selectTab = (next: PreferencesTab) => setSearchParams(next === "general" ? {} : { tab: next }, { replace: true });
  const currentRegion = WEATHER_REGIONS.find((region) => region.id === selectedRegion);
  const visibleRegions = WEATHER_REGIONS.filter((region) => region.label.toLowerCase().includes(regionQuery.trim().toLowerCase()));

  return <div className="settings-interface settings-square mx-auto max-w-6xl space-y-6">
    <PageHeading eyebrow="SYSTEM PREFERENCES" title="시스템 설정" description="이 브라우저에서 사용하는 Sugo의 기본 환경을 설정합니다." />
    <div className="grid overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_20px_70px_rgba(0,0,0,0.14)] lg:grid-cols-[14rem_minmax(0,1fr)]">
    <div className="border-b border-[var(--color-border)] bg-black/[0.08] p-3 lg:border-b-0 lg:border-r" role="tablist" aria-label="시스템 설정">
      <p className="px-3 pb-3 pt-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-[var(--color-text-dim)]">PREFERENCES</p>
      {([['general', '일반', '이름과 로컬 환경', MonitorCog], ['harness', '하네스', '프로젝트 규칙 사용 여부', ShieldCheck], ['integrations', '외부 연동', 'AWS · PR · APM 사용 여부', PlugZap], ['weekly', '주간 리포트', '일정과 실행 인증', CalendarClock], ['weather', '날씨', 'Home 생활권', CloudSun]] as const).map(([id, label, description, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => selectTab(id)} className={cn("flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition-colors", tab === id ? "border-cyan-300 bg-cyan-300/[0.07] text-cyan-100" : "border-transparent text-[var(--color-text-muted)] hover:bg-white/[0.025] hover:text-white")}><span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border", tab === id ? "border-cyan-300/30 bg-cyan-300/10" : "border-white/[0.07]")}><Icon size={14} /></span><span><strong className="block text-sm font-semibold">{label}</strong><span className="mt-0.5 block text-[10px] font-normal text-[var(--color-text-dim)]">{description}</span></span></button>)}
    </div>
    <div className="min-w-0 p-5 sm:p-7">
    {tab === "general" ? <section>
      <h2 className="text-base font-semibold text-slate-100">로컬 환경</h2>
      <div className="mt-6 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        <div className="grid gap-4 py-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center"><div><div className="text-sm font-semibold text-[var(--color-text)]">표시할 이름</div><p className="mt-1 text-[10px] leading-4 text-[var(--color-text-muted)]">인사말과 프로필에 표시됩니다.</p></div><div><div className="flex max-w-md gap-2"><input value={nickname} onFocus={() => { if (nickname !== displayName) return; setNickname(displayName); }} onChange={(event) => { setNickname(event.target.value); setSaved(false); }} maxLength={80} placeholder="이름을 입력하세요" aria-label="표시할 이름" className="settings-field min-w-0 flex-1 border-cyan-300/25 bg-black/30 hover:border-cyan-300/45 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.12)]" /><button type="button" disabled={!nickname.trim() || nickname.trim() === displayName} onClick={() => void saveDisplayName(nickname.trim()).then(() => setSaved(true))} className="settings-action settings-action-primary settings-action-compact">저장</button></div>{saved && <p className="mt-1 text-[10px] text-emerald-300">저장됨</p>}</div></div>
        <div className="grid gap-4 py-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center"><div><div className="text-sm font-semibold text-[var(--color-text)]">Console 주소</div><p className="mt-1 text-[10px] leading-4 text-[var(--color-text-muted)]">화면과 API가 함께 사용하는 로컬 주소입니다.</p></div><div><div className="font-mono text-sm text-slate-200">{window.location.host}</div><div className="mt-1 text-[10px] text-slate-600">계정 ID {userId}</div></div></div>
        <div className="grid gap-4 py-5 sm:grid-cols-[12rem_minmax(0,1fr)]"><div className="text-sm font-semibold text-[var(--color-text)]">데이터 위치</div><p className="max-w-xl text-xs leading-5 text-[var(--color-text-muted)]">작업 데이터는 이 컴퓨터의 Sugo 저장소에 유지됩니다.</p></div>
      </div>
    </section> : tab === "harness" ? <HarnessFeaturePanel /> : tab === "integrations" ? <IntegrationFeaturesPanel /> : tab === "weather" ? <section>
      <h2 className="text-base font-semibold text-[var(--color-text)]">날씨 생활권</h2><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">위치 권한 없이 선택한 생활권의 날씨를 Home에 표시합니다.</p>
      <div className="mt-6 max-w-2xl overflow-hidden border-y border-[var(--color-border)]">
        <button type="button" aria-expanded={regionPickerOpen} onClick={() => setRegionPickerOpen((open) => !open)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cyan-300/20 bg-cyan-400/[0.07] text-cyan-300"><MapPin size={17} /></span>
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
    </section> : <section>
      <h2 className="text-base font-semibold text-slate-100">주간 작업 리포트</h2><p className="mt-1 text-xs leading-5 text-slate-400">Sugo가 등록된 작업을 매주 정리해 Weekly에 남깁니다. 일정, Claude 모델과 예약 실행 토큰을 여기서 함께 관리합니다.</p>
      {weeklyLoading ? <p className="mt-5 text-xs text-slate-500">설정을 불러오는 중입니다.</p> : <div className="mt-7 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 border-l-2 border-cyan-300/20 pl-5">
          <label className="flex items-center justify-between gap-4"><span><strong className="block text-sm text-slate-100">자동 주간 정리</strong><span className="mt-1 block text-[10px] text-slate-500">완료 기록을 한 주 단위로 묶어 Weekly에서 확인합니다.</span></span><input type="checkbox" checked={weekly.enabled} onChange={(event) => { setWeekly({ ...weekly, enabled: event.target.checked }); setWeeklySaved(false); }} className="h-4 w-4 accent-cyan-400" /></label>
          <div className="border-t border-white/[0.06] pt-3"><span className="text-[11px] text-slate-400">생성 요일</span><div className="mt-1.5 grid grid-cols-7 gap-1">{[[1,"월"],[2,"화"],[3,"수"],[4,"목"],[5,"금"],[6,"토"],[0,"일"]].map(([value,label]) => <button key={value} type="button" onClick={() => { setWeekly({ ...weekly, weekday: Number(value) }); setWeeklySaved(false); }} className={cn("rounded-md border px-2 py-2 text-[12.5px]", weekly.weekday === value ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/[0.07] text-slate-400")}>{label}</button>)}</div></div>
          <div className="grid gap-3"><label className="text-[11px] text-slate-400">생성 시각<input type="time" value={`${String(weekly.hour).padStart(2,"0")}:${String(weekly.minute).padStart(2,"0")}`} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); setWeekly({ ...weekly, hour, minute }); setWeeklySaved(false); }} className="settings-field mt-1.5 block w-full" /></label><div><span className="text-[11px] text-slate-400">Claude 모델</span><div className="mt-1.5 grid grid-cols-3 gap-1">{([['default','기본'],['sonnet','Sonnet'],['opus','Opus']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setWeekly({ ...weekly, model: value }); setWeeklySaved(false); }} className={cn("whitespace-nowrap rounded-lg border px-2 py-2 text-[12.5px]", weekly.model === value ? "border-violet-300/35 bg-violet-300/10 text-violet-100" : "border-white/[0.07] text-slate-400")}>{label}</button>)}</div></div></div>
          <div className="border-t border-white/[0.06] pt-3"><span className="text-[11px] text-slate-400">추가 저장소</span><p className="mt-1 text-[10px] text-slate-500">Sugo에 등록된 프로젝트는 자동으로 포함됩니다. 그 밖의 로컬 저장소만 추가하세요.</p><div className="mt-2 flex gap-2"><input value={repositoryDraft} onChange={(event) => setRepositoryDraft(event.target.value)} placeholder="/경로/저장소" className="settings-field min-w-0 flex-1" /><button type="button" aria-label="저장소 추가" onClick={() => { const value = repositoryDraft.trim(); if (value && !weekly.extraRepositories.includes(value)) setWeekly({ ...weekly, extraRepositories: [...weekly.extraRepositories, value] }); setRepositoryDraft(""); setWeeklySaved(false); }} className="settings-action settings-action-secondary px-3"><Plus size={14} /></button></div>{weekly.extraRepositories.map((repo) => <div key={repo} className="mt-2 flex items-center gap-2 rounded-md bg-white/[0.025] px-3 py-2 font-mono text-[10px] text-slate-300"><span className="min-w-0 flex-1 truncate">{repo}</span><button type="button" aria-label={`${repo} 삭제`} onClick={() => setWeekly({ ...weekly, extraRepositories: weekly.extraRepositories.filter((value) => value !== repo) })}><Trash2 size={12} /></button></div>)}</div>
        </div>
        <div className="space-y-4 border-l-2 border-violet-300/20 pl-5">
          <div><div className="flex items-center gap-2"><KeyRound size={15} className="text-violet-300" /><strong className="text-sm text-slate-100">예약 실행용 Claude 토큰</strong></div><p className="mt-2 text-[10px] leading-5 text-slate-500">터미널에서 아래 명령으로 토큰을 만든 뒤 입력하세요. 토큰은 이 컴퓨터에 권한 600으로 저장되며 화면과 API에는 다시 표시되지 않습니다.</p></div>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#070d18] px-3 py-2"><code className="min-w-0 flex-1 text-xs text-cyan-100">claude setup-token</code><button type="button" aria-label="명령 복사" onClick={() => void navigator.clipboard.writeText("claude setup-token")} className="text-slate-400 hover:text-cyan-200"><Copy size={14} /></button></div>
          <label className="block text-[11px] text-slate-400">{tokenConfigured ? "새 토큰으로 변경" : "Claude 토큰"}<input type="password" autoComplete="new-password" value={token} onChange={(event) => { setToken(event.target.value); setWeeklySaved(false); }} placeholder={tokenConfigured ? "변경할 때만 입력" : "토큰 붙여넣기"} className="settings-field mt-1.5 block w-full" /></label>
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2"><span className={cn("text-[11px]", tokenConfigured ? "text-emerald-300" : "text-amber-200")}>{tokenConfigured ? "토큰 설정됨" : "토큰 설정 필요"}</span>{tokenConfigured && <button type="button" onClick={() => void deleteWeeklyToken().then(() => { setTokenConfigured(false); setWeeklySaved(false); })} className="settings-action settings-action-danger settings-action-compact gap-1"><Trash2 size={12} />삭제</button>}</div>
          <p className="text-[10px] leading-5 text-slate-500">기존 Weekly 설정이 있으면 처음 저장할 때 Sugo가 그대로 이어받습니다. 이후 별도 설정 페이지를 열 필요가 없습니다.</p>
        </div>
        <div className="flex items-center gap-3 lg:col-span-2"><button type="button" onClick={() => { setWeeklyError(""); void saveWeeklySettings({ ...weekly, ...(token.trim() ? { token: token.trim() } : {}) }).then((value) => { setToken(""); setTokenConfigured(value.tokenConfigured); setWeeklySaved(true); }).catch(() => setWeeklyError("설정을 저장하거나 예약을 적용하지 못했습니다.")); }} className="settings-action settings-action-primary">설정 저장</button>{weeklySaved && <span className="text-xs text-emerald-300">예약에 적용됨</span>}{weeklyError && <span className="text-xs text-rose-300">{weeklyError}</span>}</div>
      </div>}
    </section>}
    </div>
    </div>
  </div>;
}
