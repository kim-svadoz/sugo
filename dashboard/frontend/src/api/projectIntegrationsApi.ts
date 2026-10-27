import { apiJson } from './client.js';
export interface IntegrationSelection { accountName: string; service: string; environment: string; cluster?: string | null; }
export interface IntegrationCandidate extends IntegrationSelection { cluster: string | null; pinpointApplicationName: string | null; images: string[]; }
export interface ProjectIntegration { workspace_name: string; project_path: string; configured: boolean; selections: IntegrationSelection[]; }
export interface ProjectRegistrationResult { ok: true; projectPath: string; projectName: string; workspace: string; detectedStack: unknown; appliedHarnesses: unknown[]; warnings: string[]; }
export const getProjectIntegrations = () => apiJson<{ projects: ProjectIntegration[]; candidates: IntegrationCandidate[] }>('/api/project-integrations');
export const registerProject = (projectPath: string, workspace: string) => apiJson<ProjectRegistrationResult>('/api/project-integrations/register', { method: 'POST', body: JSON.stringify({ projectPath, workspace }) });
export const saveProjectIntegration = (projectPath: string, selections: IntegrationSelection[]) => apiJson<{ ok: true }>('/api/project-integrations', { method: 'PUT', body: JSON.stringify({ projectPath, selections }) });
