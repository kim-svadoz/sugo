import { useEffect, useState } from "react";
import { getIntegrationFeatures, INTEGRATION_FEATURES_OFF, saveIntegrationFeatures, type IntegrationFeatures } from "../api/integrationFeaturesApi.js";
import { cn } from "../lib/utils.js";

const FEATURES: { key: keyof IntegrationFeatures; label: string; description: string; tabs: string }[] = [
  { key: "aws", label: "AWS", description: "배포 상태와 클라우드 리소스를 읽습니다.", tabs: "AWS 계정 · 서비스 상태 연동" },
  { key: "pr", label: "PR", description: "GitHub, CodeCommit의 PR과 브랜치를 읽습니다.", tabs: "PR 연동" },
  { key: "apm", label: "APM", description: "Pinpoint의 실행 상태와 성능 지표를 읽습니다.", tabs: "모니터링" },
];

export function IntegrationFeaturesPanel() {
  const [features, setFeatures] = useState<IntegrationFeatures>(INTEGRATION_FEATURES_OFF);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getIntegrationFeatures()
      .then((value) => { if (!cancelled) setFeatures(value); })
      .catch(() => { if (!cancelled) setError("외부 연동 설정을 불러오지 못했습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggle = async (key: keyof IntegrationFeatures) => {
    const previous = features;
    const next = { ...features, [key]: !features[key] };
    setFeatures(next);
    setError("");
    try {
      setFeatures(await saveIntegrationFeatures(next));
    } catch {
      setFeatures(previous);
      setError("저장하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  return <section>
    <h2 className="text-base font-semibold text-slate-100">외부 연동 사용</h2>
    <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">처음에는 모두 꺼져 있습니다. 쓰는 것만 켭니다.</p>
    {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    <div className="mt-6 divide-y divide-white/[0.06] border-y border-white/[0.06]">
      {FEATURES.map(({ key, label, description, tabs }) => {
        const on = features[key];
        return <div key={key} className="grid gap-4 py-5 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center">
          <div><div className="text-sm font-semibold text-[var(--color-text)]">{label}</div><p className="mt-1 text-[10px] leading-4 text-[var(--color-text-muted)]">{description}</p></div>
          <p className="text-xs leading-5 text-[var(--color-text-muted)]">켜면 Integrations › 외부 서비스에 <span className="text-cyan-200">{tabs}</span> 탭이 열립니다.</p>
          <div className="flex items-center gap-3">
            <span className={cn("text-[11px]", on ? "text-cyan-200" : "text-slate-500")}>{on ? "켜짐" : "꺼짐"}</span>
            <button type="button" role="switch" aria-checked={on} aria-label={`${label} 사용`} disabled={loading} onClick={() => void toggle(key)} className={cn("relative h-6 w-11 border transition-colors disabled:opacity-40", on ? "border-cyan-300/60 bg-cyan-400/25" : "border-white/15 bg-white/[0.04]")}>
              <span className={cn("absolute top-[3px] h-4 w-4 transition-all", on ? "left-[23px] bg-cyan-200" : "left-[3px] bg-slate-500")} />
            </button>
          </div>
        </div>;
      })}
    </div>
  </section>;
}
