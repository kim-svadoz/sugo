import type { DbClient } from '../db/client.js';
import { parseMaybeJson } from '../db/jsonColumn.js';
import { upsertRow } from '../db/upsert.js';
import { environmentOfAccount } from './awsEnvironment.js';

export interface ProjectIntegrationSelection { accountName: string; service: string; environment: string; cluster?: string | null; }

function selectionKey(item: ProjectIntegrationSelection): string { return `${item.accountName}\u0000${item.cluster ?? ''}\u0000${item.service}\u0000${item.environment}`; }

async function integrationCandidates(db: DbClient, userId: string) {
  const snapshots = await db.query<{ account_name: string; payload: unknown }>('SELECT account_name, payload FROM user_aws_context_snapshots WHERE user_id = ? ORDER BY account_name', [userId]);
  return snapshots.flatMap((snapshot) => parseMaybeJson<any[]>(snapshot.payload, []).flatMap((inventory) => inventory?.service === 'ecs' ? (inventory.resources ?? []) : []).filter((resource: any) => resource?.kind === 'service').map((resource: any) => ({
    accountName: snapshot.account_name, environment: environmentOfAccount(snapshot.account_name), service: String(resource.id),
    cluster: typeof resource.metadata?.cluster === 'string' ? resource.metadata.cluster : null,
    pinpointApplicationName: typeof resource.metadata?.pinpointApplicationName === 'string' ? resource.metadata.pinpointApplicationName : null,
    images: Array.isArray(resource.metadata?.images) ? resource.metadata.images : [],
  })));
}

export async function listProjectIntegrations(db: DbClient, userId: string) {
  const projects = await db.query<{ workspace_name: string; project_path: string }>(`SELECT w.name AS workspace_name, p.project_path FROM sugo_workspace_projects p JOIN sugo_workspaces w ON w.id = p.workspace_id WHERE w.user_id = ? AND w.deleted_at IS NULL ORDER BY w.name, p.project_path`, [userId]);
  const candidates = await integrationCandidates(db, userId);
  const mappings = await db.query<{ project_path: string; selections: unknown }>('SELECT project_path, selections FROM user_project_integration_mappings WHERE user_id = ?', [userId]);
  const byPath = new Map(mappings.map((row) => [row.project_path, parseMaybeJson<ProjectIntegrationSelection[]>(row.selections, [])]));
  return { candidates, projects: projects.map((project) => ({ ...project, configured: byPath.has(project.project_path), selections: byPath.get(project.project_path) ?? [] })) };
}

export async function saveProjectIntegration(db: DbClient, userId: string, projectPath: string, selections: ProjectIntegrationSelection[]) {
  const owned = await db.query(`SELECT 1 FROM sugo_workspace_projects p JOIN sugo_workspaces w ON w.id = p.workspace_id WHERE w.user_id = ? AND p.project_path = ?`, [userId, projectPath]);
  if (!owned[0]) throw Object.assign(new Error('Project not found'), { code: 'PROJECT_NOT_FOUND' });
  const existingRows = await db.query<{ selections: unknown }>('SELECT selections FROM user_project_integration_mappings WHERE user_id = ? AND project_path = ?', [userId, projectPath]);
  const existing = parseMaybeJson<ProjectIntegrationSelection[]>(existingRows[0]?.selections, []);
  const allowed = new Set([...(await integrationCandidates(db, userId)), ...existing].map(selectionKey));
  if (selections.some((selection) => !allowed.has(selectionKey(selection)))) {
    throw Object.assign(new Error('Service is not present in the synchronized AWS inventory'), { code: 'SERVICE_NOT_AVAILABLE' });
  }
  await upsertRow(db, 'user_project_integration_mappings', { user_id: userId, project_path: projectPath }, { selections: JSON.stringify(selections), updated_at: new Date().toISOString() });
}
