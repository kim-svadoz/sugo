import { FolderCog, FolderGit2, FolderOpen, FolderPen, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getProjectIntegrations, moveProject, removeProject, selectNativeProjectDirectory, type ProjectIntegration } from "../api/projectIntegrationsApi.js";

const SUGO_FILES_NOTICE = "프로젝트의 .claude/rules/ 안 Sugo 규칙, CLAUDE.md·AGENTS.md의 Sugo 블록, sugo/harness와 설정 파일을 지웁니다. PRD·스펙·작업 결과와 직접 만든 파일은 남습니다.";

function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function ProjectManagementPanel() {
  const [projects, setProjects] = useState<ProjectIntegration[] | null>(null);
  const [domain, setDomain] = useState("");
  const [mode, setMode] = useState<{ path: string; kind: "move" | "remove" } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const byDomain = useMemo(() => {
    const groups = new Map<string, ProjectIntegration[]>();
    for (const project of projects ?? []) groups.set(project.workspace_name, [...(groups.get(project.workspace_name) ?? []), project]);
    return groups;
  }, [projects]);
  const domains = [...byDomain.keys()];
  const activeDomain = byDomain.has(domain) ? domain : domains[0] ?? "";
  const domainProjects = byDomain.get(activeDomain) ?? [];

  const load = () => getProjectIntegrations().then((value) => setProjects(value.projects)).catch(() => { setProjects([]); setError("등록된 프로젝트를 불러오지 못했습니다."); });
  useEffect(() => { void load(); }, []);

  const open = (path: string, kind: "move" | "remove") => { setMode({ path, kind }); setDraft(path); setError(""); setDone(""); };
  const pickFolder = async () => {
    try {
      const result = await selectNativeProjectDirectory();
      if (!result.supported) setError("이 환경에서는 폴더 선택 창을 열 수 없습니다. 경로를 직접 입력하세요.");
      else if (!result.cancelled) setDraft(result.path);
    } catch { setError("폴더 선택 창을 열지 못했습니다. 경로를 직접 입력하세요."); }
  };
  const apply = async () => {
    if (!mode) return;
    setBusy(true); setError("");
    try {
      if (mode.kind === "remove") {
        const result = await removeProject(mode.path);
        setDone(result.folderMissing ? `${projectName(mode.path)}의 폴더가 없어 등록만 해제했습니다.` : `${projectName(mode.path)}를 Sugo에서 뺐습니다. Sugo 파일 ${result.removedFiles.length}개를 지웠습니다.`);
      } else {
        const result = await moveProject(mode.path, draft.trim());
        setDone(`${projectName(result.to)}의 경로를 바꾸고 새 경로에 규칙을 적용했습니다.`);
      }
      setMode(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  return <div id="integration-project-manage" className="scroll-mt-24 overflow-hidden">
    <div className="integration-panel-header flex items-center justify-between gap-3 border-b border-[var(--color-border)]"><div className="flex items-center gap-2.5"><span className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300/20 text-[var(--color-primary)]"><FolderCog size={17} /></span><div><h2 className="text-xl font-semibold text-[var(--color-text)]">프로젝트 관리</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">등록된 프로젝트의 경로를 바꾸거나 Sugo에서 뺍니다.</p></div></div></div>
    <div className="integration-panel-body space-y-5">
      <section aria-label="등록된 프로젝트 관리" className="overflow-hidden border-y border-cyan-300/20 bg-[linear-gradient(120deg,rgba(34,211,238,0.055),rgba(15,23,42,0.14)_45%,transparent)]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5"><span className="grid h-10 w-10 place-items-center border border-cyan-300/20 bg-cyan-300/[0.055] text-cyan-200"><FolderGit2 size={18} /></span><div><strong className="text-base text-[var(--color-text)]">등록된 프로젝트</strong><p className="mt-1 text-[11px] text-[var(--color-text-muted)]">도메인을 고른 뒤 프로젝트의 경로를 바꾸거나 제거하세요.</p></div></div>
        <div className="bg-[var(--color-background)]/95 px-6 py-6">
          {projects === null ? <p className="text-xs text-[var(--color-text-dim)]">불러오는 중입니다.</p>
            : domains.length === 0 ? <div className="grid min-h-28 place-items-center text-xs text-[var(--color-text-dim)]">등록된 프로젝트가 없습니다.</div>
            : <div aria-label="도메인 브라우저" className="grid min-h-56 overflow-hidden border-y border-white/[0.08] bg-black/10 sm:grid-cols-[16rem_minmax(0,1fr)]">
              <nav aria-label="도메인" className="border-b border-white/[0.08] p-2 sm:border-b-0 sm:border-r">
                {domains.map((name) => { const active = activeDomain === name; return <button key={name} type="button" aria-pressed={active} onClick={() => { setDomain(name); setMode(null); }} className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition ${active ? "bg-cyan-300/[0.08] text-cyan-50 shadow-[inset_3px_0_0_rgba(103,232,249,0.9)]" : "text-[var(--color-text-muted)] hover:bg-white/[0.025] hover:text-[var(--color-text)]"}`}><strong className="truncate text-sm">{name}</strong><span className="shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]">{byDomain.get(name)?.length ?? 0}</span></button>; })}
              </nav>
              <section aria-label="선택한 도메인의 프로젝트" className="p-5">
                <div className="divide-y divide-white/[0.06]">
                  {domainProjects.map((project) => {
                    const active = mode?.path === project.project_path ? mode.kind : null;
                    return <div key={project.project_path} className="py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center bg-cyan-300/[0.05] text-cyan-200"><FolderGit2 size={14} /></span>
                        <span title={project.project_path} className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-text)]">{projectName(project.project_path)}</span>
                        <button type="button" disabled={busy} onClick={() => open(project.project_path, "move")} className="settings-action settings-action-secondary settings-action-compact gap-1"><FolderPen size={12} />경로 변경</button>
                        <button type="button" disabled={busy} onClick={() => open(project.project_path, "remove")} className="settings-action settings-action-danger settings-action-compact gap-1"><Trash2 size={12} />제거</button>
                      </div>
                      {active === "move" && <div className="ml-11 mt-3 space-y-3 border-l-2 border-cyan-300/30 pl-4">
                        <p className="text-[11px] text-[var(--color-text-muted)]">새 경로에 같은 도메인으로 규칙을 적용하고, 이전 경로에 폴더가 남아 있으면 그곳의 Sugo 파일을 지웁니다.</p>
                        <div className="flex h-12 items-center gap-3 border border-cyan-300/25 bg-black/30 px-4 transition focus-within:border-cyan-300/45"><input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="새 프로젝트 경로" className="min-w-0 flex-1 bg-transparent font-mono text-sm text-[var(--color-text)] outline-none" /><button type="button" onClick={() => void pickFolder()} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-cyan-200"><FolderOpen size={15} />폴더 찾아보기</button></div>
                        <div className="flex items-center gap-2"><button type="button" disabled={busy || !draft.trim() || draft.trim() === project.project_path} onClick={() => void apply()} className="settings-action settings-action-primary settings-action-compact">{busy ? "적용 중…" : "경로 변경"}</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="settings-action settings-action-secondary settings-action-compact">취소</button></div>
                      </div>}
                      {active === "remove" && <div className="ml-11 mt-3 space-y-2 border-l-2 border-rose-300/40 pl-4">
                        <p className="text-xs font-semibold text-rose-200">{projectName(project.project_path)}를 Sugo에서 뺍니다.</p>
                        <p className="text-[11px] leading-5 text-[var(--color-text-muted)]">{SUGO_FILES_NOTICE}</p>
                        <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={() => void apply()} className="settings-action settings-action-danger settings-action-compact gap-1"><Trash2 size={12} />{busy ? "제거 중…" : "제거"}</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="settings-action settings-action-secondary settings-action-compact">취소</button></div>
                      </div>}
                    </div>;
                  })}
                </div>
              </section>
            </div>}
        </div>
        {error && <p role="alert" className="mx-6 mb-5 text-xs text-rose-300">{error}</p>}
      </section>
      {done && <div role="status" className="border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-xs font-semibold text-emerald-200">✓ {done}</div>}
    </div>
  </div>;
}
