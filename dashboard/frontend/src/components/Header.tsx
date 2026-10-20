import { useLocation } from "react-router-dom";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";
import { headerTitleForPath } from "../lib/sidebarNavigation.js";

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
  const { pathname } = useLocation();
  const pageTitle = headerTitleForPath(pathname);

  return (
    <header className="flex h-14 items-center justify-between gap-6 border-b border-white/[0.055] bg-[var(--color-surface)]/70 px-6 ck-glass">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="font-medium text-[var(--color-text-dim)]">Console</span>
        <span className="text-[var(--color-text-dim)]/50" aria-hidden="true">/</span>
        <h1 className="truncate font-semibold text-[var(--color-text-bright)]">{pageTitle}</h1>
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
