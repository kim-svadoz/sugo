import { useDashboardMeta } from "../hooks/useDashboardMeta.js";

/**
 * Header — h-16 ck-glass. **버전 뱃지 2축이 핵심**이다:
 * - `Console v{dashboardVersion}` — 빌드타임에 박힌 대시보드 자신의 버전(회색 보더 + cyan).
 * - `Plugin v{pluginVersion}` — 마지막 sync에서 받은 플러그인 버전(emerald + 펄스닷).
 *   아직 sync된 적이 없으면 `—`. 버전을 지어내지 않는다 — "모른다"가 정확한 정보다.
 *
 * 두 축을 나란히 두는 이유: 문제가 생겼을 때 "웹이 낡은 건지 플러그인이 낡은 건지"가
 * 첫 번째 분기점인데, 하나만 보이면 그 판단을 못 한다.
 */
export function Header() {
  const { dashboardVersion, pluginVersion } = useDashboardMeta();

  return (
    <header className="relative flex h-20 items-center justify-between gap-6 overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 px-7 ck-glass">
      <span className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-cyan-300/60 to-transparent" aria-hidden="true" />
      <div className="flex min-w-0 items-center gap-5">
        <div className="flex shrink-0 items-baseline gap-2.5">
          <h1 className="text-[23px] font-semibold tracking-[-0.035em] text-[var(--color-text-bright)]">SUGÒ</h1>
          <span className="font-mono text-[13px] font-medium text-cyan-300">Console</span>
        </div>
        <span className="hidden h-8 w-px bg-white/[0.10] sm:block" aria-hidden="true" />
        <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
          <span className="text-[12px] font-semibold leading-4 tracking-[0.01em] text-[var(--color-text)]">AI Engineering Control Plane</span>
          <span className="truncate text-[11px] leading-4 tracking-[0.01em] text-[var(--color-text-dim)]">From specification to verified delivery.</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-[11.5px] text-slate-300"
          title="Sugo 웹 대시보드 콘솔 버전"
        >
          <span className="text-slate-500">Console</span>
          <span className="text-cyan-300">v{dashboardVersion}</span>
        </span>
        <span
          className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11.5px] text-emerald-300"
          title="내가 설치한 Sugo 플러그인 버전 (마지막 sync 시점)"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ck-pulse-dot" />
          <span className="text-emerald-400/70">Plugin</span>
          <span className="text-emerald-200">{pluginVersion ? `v${pluginVersion}` : "—"}</span>
        </span>
      </div>
    </header>
  );
}
