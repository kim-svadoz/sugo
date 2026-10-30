import { useEffect, useState } from "react";
import { getHarnessFeature, setHarnessFeature } from "../api/harnessFeatureApi.js";
import { cn } from "../lib/utils.js";

export function HarnessFeaturePanel() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [projectCount, setProjectCount] = useState<number | null>(null);

  useEffect(() => { void getHarnessFeature().then((value) => setEnabled(value.enabled)).catch(() => setError("하네스 설정을 불러오지 못했습니다.")).finally(() => setLoading(false)); }, []);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true); setError("");
    try {
      const result = await setHarnessFeature(next);
      setEnabled(result.enabled);
      setProjectCount(result.projectCount ?? null);
    } catch { setError("하네스 설정을 적용하지 못했습니다."); }
    finally { setSaving(false); }
  };

  return <section>
    <h2 className="text-base font-semibold text-slate-100">하네스 사용</h2>
    <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">프로젝트에 Sugo 코딩 규칙을 제공할지 선택합니다. 바꾼 설정은 새로 여는 Claude 세션부터 적용되므로, 이미 열려 있는 세션은 다시 시작하세요.</p>
    {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    <div className="mt-6 divide-y divide-white/[0.06] border-y border-white/[0.06]">
      <div className="grid gap-4 py-5 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center">
        <div><div className="text-sm font-semibold text-[var(--color-text)]">프로젝트 하네스</div><p className="mt-1 text-[10px] leading-4 text-[var(--color-text-muted)]">스택별 기본 규칙과 직접 고친 규칙</p></div>
        <div>
          <p className="text-xs leading-5 text-[var(--color-text-muted)]">{enabled ? "등록된 프로젝트에 규칙을 적용하고, 에이전트가 작업 전에 읽습니다." : "규칙 원본과 직접 고친 내용은 그대로 두고, 프로젝트와 에이전트에는 제공하지 않습니다. 다시 켜면 그대로 돌아옵니다."}</p>
          {projectCount !== null && <p className="mt-1 text-[10px] text-cyan-200">등록된 프로젝트 {projectCount}곳에 반영했습니다.</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-[11px]", saving ? "text-slate-400" : enabled ? "text-cyan-200" : "text-slate-500")}>{saving ? "반영 중" : enabled ? "켜짐" : "꺼짐"}</span>
          <button type="button" role="switch" aria-checked={enabled} aria-label="프로젝트 하네스 사용" disabled={loading || saving} onClick={() => void toggle()} className={cn("relative h-6 w-11 border transition-colors disabled:opacity-40", enabled ? "border-cyan-300/60 bg-cyan-400/25" : "border-white/15 bg-white/[0.04]")}>
            <span className={cn("absolute top-[3px] h-4 w-4 transition-all", enabled ? "left-[23px] bg-cyan-200" : "left-[3px] bg-slate-500")} />
          </button>
        </div>
      </div>
    </div>
  </section>;
}
