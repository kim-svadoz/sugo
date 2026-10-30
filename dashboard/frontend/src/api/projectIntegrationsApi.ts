import { apiFetch, apiJson } from './client.js';
export interface IntegrationSelection { accountName: string; service: string; environment: string; cluster?: string | null; }
export interface IntegrationCandidate extends IntegrationSelection { cluster: string | null; pinpointApplicationName: string | null; images: string[]; }
export interface ProjectIntegration { workspace_name: string; project_path: string; configured: boolean; selections: IntegrationSelection[]; }
export interface ProjectRegistrationResult { ok: true; projectPath: string; projectName: string; workspace: string; detectedStack: unknown; appliedHarnesses: unknown[]; warnings: string[]; }
export interface LocalDirectoryEntry { name: string; path: string; projectLike: boolean; signals: string[]; }
export interface LocalDirectoryListing { path: string; parentPath: string | null; name: string; projectLike: boolean; signals: string[]; directories: LocalDirectoryEntry[]; }
export type NativeDirectorySelection = { supported: boolean; cancelled: true } | { supported: true; cancelled: false; path: string; name: string; projectLike: boolean; signals: string[] };
export const getProjectIntegrations = () => apiJson<{ projects: ProjectIntegration[]; candidates: IntegrationCandidate[] }>('/api/project-integrations');
export const registerProject = (projectPath: string, workspace: string) => apiJson<ProjectRegistrationResult>('/api/project-integrations/register', { method: 'POST', body: JSON.stringify({ projectPath, workspace }) });
export const browseLocalDirectories = (path?: string) => apiJson<LocalDirectoryListing>(`/api/project-integrations/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`);
export const selectNativeProjectDirectory = () => apiJson<NativeDirectorySelection>('/api/project-integrations/select-directory', { method: 'POST' });
export const saveProjectIntegration = (projectPath: string, selections: IntegrationSelection[]) => apiJson<{ ok: true }>('/api/project-integrations', { method: 'PUT', body: JSON.stringify({ projectPath, selections }) });
export interface ProjectRemoveResult { ok: true; projectPath: string; folderMissing: boolean; removedFiles: string[]; workspaces: string[]; }
export interface ProjectMoveResult { ok: true; from: string; to: string; workspace: string | null; removedFiles: string[]; }
async function postProjectChange<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({})) as { message?: string };
  if (!res.ok) throw new Error(data.message || '프로젝트를 변경하지 못했습니다.');
  return data as T;
}
export const removeProject = (projectPath: string) => postProjectChange<ProjectRemoveResult>('/api/project-integrations/remove', { projectPath });
export const moveProject = (from: string, to: string) => postProjectChange<ProjectMoveResult>('/api/project-integrations/move', { from, to });
