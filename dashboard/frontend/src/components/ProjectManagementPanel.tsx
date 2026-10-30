import { FolderOpen, FolderPen, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getProjectIntegrations, moveProject, removeProject, selectNativeProjectDirectory, type ProjectIntegration } from "../api/projectIntegrationsApi.js";

const SUGO_FILES_NOTICE = "프로젝트의 .claude/rules/ 안 Sugo 규칙, CLAUDE.md·AGENTS.md의 Sugo 블록, sugo/harness와 설정 파일을 지웁니다. PRD·스펙·작업 결과와 직접 만든 파일은 남습니다.";

function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function ProjectManagementPanel() {
  const [projects, setProjects] = useState<ProjectIntegration[] | null>(null);
  const [mode, setMode] = useState<{ path: string; kind: "move" | "remove" } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

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

  return <div className="integration-panel-body space-y-4">
    {done && <p className="text-xs text-emerald-300">{done}</p>}
    {projects === null ? <p className="text-xs text-[var(--color-text-dim)]">불러오는 중입니다.</p>
      : projects.length === 0 ? <p className="text-xs text-[var(--color-text-dim)]">등록된 프로젝트가 없습니다.</p>
      : <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {projects.map((project) => {
          const active = mode?.path === project.project_path ? mode.kind : null;
          return <div key={project.project_path} className="py-4">
            <div className="grid items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
              <span className="truncate font-mono text-[11px] text-cyan-200">{project.workspace_name}</span>
              <div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--color-text)]">{projectName(project.project_path)}</div><div className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-text-dim)]">{project.project_path}</div></div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy} onClick={() => open(project.project_path, "move")} className="settings-action settings-action-secondary settings-action-compact gap-1"><FolderPen size={12} />경로 변경</button>
                <button type="button" disabled={busy} onClick={() => open(project.project_path, "remove")} className="settings-action settings-action-danger settings-action-compact gap-1"><Trash2 size={12} />제거</button>
              </div>
            </div>
            {active === "move" && <div className="mt-3 space-y-2 border-l-2 border-cyan-300/30 pl-4">
              <p className="text-[11px] text-[var(--color-text-muted)]">새 경로에 같은 도메인으로 규칙을 적용하고, 이전 경로에 폴더가 남아 있으면 그곳의 Sugo 파일을 지웁니다.</p>
              <div className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="새 프로젝트 경로" className="settings-field min-w-0 flex-1 font-mono text-xs" /><button type="button" onClick={() => void pickFolder()} className="settings-action settings-action-secondary settings-action-compact gap-1"><FolderOpen size={12} />폴더 선택</button></div>
              <div className="flex items-center gap-2"><button type="button" disabled={busy || !draft.trim() || draft.trim() === project.project_path} onClick={() => void apply()} className="settings-action settings-action-primary settings-action-compact">{busy ? "적용 중" : "경로 변경"}</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="settings-action settings-action-secondary settings-action-compact">취소</button>{error && <span className="text-xs text-rose-300">{error}</span>}</div>
            </div>}
            {active === "remove" && <div className="mt-3 space-y-2 border-l-2 border-rose-300/40 pl-4">
              <p className="text-xs font-semibold text-rose-200">{projectName(project.project_path)}를 Sugo에서 뺍니다.</p>
              <p className="text-[11px] leading-5 text-[var(--color-text-muted)]">{SUGO_FILES_NOTICE}</p>
              <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={() => void apply()} className="settings-action settings-action-danger settings-action-compact gap-1"><Trash2 size={12} />{busy ? "제거 중" : "제거"}</button><button type="button" disabled={busy} onClick={() => setMode(null)} className="settings-action settings-action-secondary settings-action-compact">취소</button>{error && <span className="text-xs text-rose-300">{error}</span>}</div>
            </div>}
          </div>;
        })}
      </div>}
  </div>;
}
