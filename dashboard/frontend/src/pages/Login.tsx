import { ArrowRight, Building2, Check, Laptop, ShieldCheck, Workflow } from "lucide-react";
import { useAuth } from "../auth/AuthContext.js";

export function Login() {
  const { login } = useAuth();
  const localDev = import.meta.env.VITE_LOCAL_DEV === "true";
  const teamWorkspacesEnabled = import.meta.env.VITE_TEAM_WORKSPACES === "true";

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-auto px-5 py-10">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/[0.045] blur-[100px]" />
      <section className="relative w-full max-w-[920px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#080e19]/95 shadow-[0_36px_100px_rgba(0,0,0,.55)]">
        <header className="border-b border-white/[0.065] px-7 py-7 sm:px-10">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/25 via-cyan-400/10 to-violet-400/20 text-cyan-100 ring-1 ring-inset ring-cyan-200/30">
              <Workflow size={22} strokeWidth={2} />
            </span>
            <div>
              <span className="block text-[18px] font-bold tracking-[0.16em] text-white">SUGO</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">AI DEVELOPMENT WORKFLOW</span>
            </div>
          </div>
          <div className="mt-8 max-w-2xl">
            <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-cyan-300">WORKSPACE GATE</span>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white sm:text-[34px]">작업 공간으로 들어갑니다</h1>
            <p className="mt-3 text-[13px] leading-6 text-slate-400">이 컴퓨터의 프로젝트와 Sugo 작업 기록을 연결해 개발 흐름을 이어가세요.</p>
          </div>
        </header>

        <div className={`grid gap-4 px-7 py-7 sm:px-10 sm:py-9 ${teamWorkspacesEnabled ? "lg:grid-cols-2" : ""}`}>
          <button type="button" onClick={() => login()} className="group relative overflow-hidden rounded-2xl border border-cyan-200/20 bg-[linear-gradient(135deg,rgba(34,211,238,.10),rgba(15,23,42,.72)_54%,rgba(139,92,246,.06))] p-6 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-200/40 hover:shadow-[0_16px_42px_rgba(6,182,212,.10)]">
            <span className="absolute inset-y-6 left-0 w-0.5 rounded-full bg-cyan-300" />
            <div className="flex items-start justify-between gap-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-300/[0.08] text-cyan-200"><Laptop size={21} /></span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 font-mono text-[9px] font-semibold tracking-[0.08em] text-emerald-200"><Check size={11} />LOCAL READY</span>
            </div>
            <span className="mt-7 block font-mono text-[9px] font-semibold tracking-[0.16em] text-cyan-300">PERSONAL WORKSPACE</span>
            <strong className="mt-2 block text-[20px] font-semibold text-white">이 컴퓨터에서 계속하기</strong>
            <span className="mt-2 block text-[12px] leading-6 text-slate-400">로컬 프로젝트, 작업 기록, 연동 설정을 이 기기에서 관리합니다.</span>
            <span className="mt-7 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] font-semibold text-cyan-100">
              {localDev ? "로컬 작업 공간 열기" : "개인 작업 공간 열기"}<ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </span>
          </button>

          {teamWorkspacesEnabled && <button type="button" className="group rounded-2xl border border-violet-200/15 bg-violet-300/[0.035] p-6 text-left transition hover:border-violet-200/30">
            <div className="flex items-start justify-between gap-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-violet-200/15 bg-violet-300/[0.07] text-violet-200"><Building2 size={21} /></span>
              <ShieldCheck size={17} className="text-violet-300" />
            </div>
            <span className="mt-7 block font-mono text-[9px] font-semibold tracking-[0.16em] text-violet-300">TEAM WORKSPACE</span>
            <strong className="mt-2 block text-[20px] font-semibold text-white">조직 작업 공간</strong>
            <span className="mt-2 block text-[12px] leading-6 text-slate-400">팀 정책과 공유 프로젝트를 사용하는 조직용 진입점입니다.</span>
          </button>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.055] px-7 py-4 text-[9px] text-slate-600 sm:px-10">
          <span>프로젝트 코드는 이 컴퓨터에서 실행됩니다.</span>
          <span className="font-mono tracking-[0.08em]">LOCAL-FIRST · READ-ONLY BY DEFAULT</span>
        </footer>
      </section>
    </main>
  );
}
