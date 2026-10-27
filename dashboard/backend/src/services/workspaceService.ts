import { projectSpecDeployments, type SpecDeployment } from "./specDeploymentService.js";
import { projectHumanCompletion } from "./humanCompletion.js";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, rename as renameFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { DbClient } from "../db/client.js";
import { ensureWorkspaceDeletedAtColumn } from "./syncService.js";
import { readySet, topoSort, wouldCreateCycle } from "./roadmapGraph.js";
import { parseJsonArray, parseMaybeJson } from "../db/jsonColumn.js";
import { linkAwsDeployments, linkAwsRelease, type AwsDeploymentSnapshot, type AwsProjectDeployment, type AwsProjectRelease, type PinpointApplicationSnapshot, type ProjectIntegrationSelection } from "./awsDeploymentLink.js";
import { describeRemoteGit, type RemoteGitState } from "../git/remoteGit.js";

const execFileAsync = promisify(execFile);

export interface LocalGitState { branch: string | null; headCommit: string | null; baseCommit: string | null; dirty: boolean; }

export interface WorkspaceProjectRow {
  project_path: string;
  git_synced: number;
  aws_synced: number;
  aws_deployments: AwsProjectDeployment[];
  aws_release: AwsProjectRelease | null;
  local_git: LocalGitState;
  remote_git: RemoteGitState | null;
}

async function readRemoteGitState(projectPath: string): Promise<RemoteGitState | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectPath, "remote", "get-url", "origin"], { timeout: 5_000 });
    const remoteUrl = stdout.trim();
    return remoteUrl ? describeRemoteGit(remoteUrl) : null;
  } catch {
    return null;
  }
}

async function resolveBaseCommit(projectPath: string, baseBranch: string | null): Promise<string | null> {
  if (!baseBranch) return null;
  for (const ref of [`refs/remotes/origin/${baseBranch}`, `refs/heads/${baseBranch}`]) {
    try {
      const { stdout } = await execFileAsync("git", ["-C", projectPath, "rev-parse", "--verify", ref], { timeout: 5_000 });
      if (stdout.trim()) return stdout.trim();
    } catch {
      // Try the next explicit ref. Never compare a pipeline branch with the checked-out feature HEAD.
    }
  }
  return null;
}

async function readLocalGitState(projectPath: string, baseBranch: string | null): Promise<LocalGitState> {
  try {
    const [{ stdout: head }, { stdout: branch }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["-C", projectPath, "rev-parse", "HEAD"], { timeout: 5_000 }),
      execFileAsync("git", ["-C", projectPath, "branch", "--show-current"], { timeout: 5_000 }),
      execFileAsync("git", ["-C", projectPath, "status", "--porcelain"], { timeout: 5_000 }),
    ]);
    return {
      headCommit: head.trim() || null,
      branch: branch.trim() || null,
      baseCommit: await resolveBaseCommit(projectPath, baseBranch),
      dirty: status.trim().length > 0,
    };
  } catch {
    return { headCommit: null, branch: null, baseCommit: null, dirty: false };
  }
}

export interface TaskCounts {
  pending: number;
  in_progress: number;
  done: number;
  archived: number;
}

export interface RoadmapCounts {
  total: number;
  done: number;
  active: number;
}

/**
 * 카드/Inspector가 실제로 읽는 필드들. 화면이 요구하는 모양을 그대로 돌려준다 —
 * 프론트에서 카운트를 다시 계산하게 두면 목록 화면 하나 그리려고 워크스페이스마다 N번씩
 * 추가 조회를 하게 된다.
 */
export interface WorkspaceSummary {
  name: string;
  projects: WorkspaceProjectRow[];
  taskCounts: TaskCounts;
  roadmap: RoadmapCounts;
  /** 평평한 별칭 — `ws.roadmapCount` 형태로 직접 참조된다. */
  roadmapCount: number;
  roadmapDoneCount: number;
  activeTaskCount: number;
  historyCount: number;
  checkpointCount: number;
  projectCount: number;
  /** 사람이 지금 확인해야 할 task(차단·6h 정체·미검증 완료)의 합계와 최우선 요약. */
  attentionCount: number;
  attentionLabel: string | null;
  /** `Recently Active (30d)` 필터의 기준. 활동이 전혀 없으면 null. */
  lastActivityAt: string | null;
}

const STALE_ATTENTION_HOURS = 6;

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function isStale(status: string, updatedAt: string | null, now = Date.now()): boolean {
  const updated = timestampMs(updatedAt);
  return status === "in_progress" && updated !== null && now - updated >= STALE_ATTENTION_HOURS * 3_600_000;
}

export function isUnverifiedWorkResult(workResult: unknown): boolean {
  const parsed = parseMaybeJson<{ report?: { completionGrade?: string } } | null>(workResult, null);
  return parsed?.report?.completionGrade === "unverified";
}

type RuntimeAssessmentSummary = {
  projectionSchemaVersion?: number;
  status?: "in_progress" | "blocked" | "completed" | "cancelled";
};

function projectedTaskStatus(rawStatus: string, runtimeAssessment: unknown, workResult?: unknown): string {
  const assessment = parseMaybeJson<RuntimeAssessmentSummary | null>(runtimeAssessment, null);
  if (assessment?.projectionSchemaVersion !== 1) return rawStatus;
  if (assessment.status === "completed") return "done";
  if (assessment.status === "cancelled") return workResult ? "done" : "dropped";
  return assessment.status ?? rawStatus;
}

async function workspaceAttention(db: DbClient, userId: string, workspaceName: string): Promise<{ count: number; label: string | null }> {
  const rows = (await getRoadmap(db, userId, workspaceName)).filter(n => n.level === "task");
  let blocked = 0;
  let stale = 0;
  let unverified = 0;
  for (const row of rows) {
    const status = row.display_status ?? row.status;
    if (status === "blocked") blocked++;
    else if (isStale(status, row.updated_at)) stale++;
    if (isUnverifiedWorkResult(row.work_result)) unverified++;
  }
  const count = blocked + stale + unverified;
  const label = blocked > 0 ? `차단 ${blocked}건` : stale > 0 ? `확인 필요 ${stale}건` : unverified > 0 ? `검증 ${unverified}건` : null;
  return { count, label };
}

// roadmap count는 level='task'만, active는 COALESCE(manual_status,status)='in_progress'.
// **dropped는 분모에서 제외**한다 — 폐기는 "안 하기로 한 일"이라 진행률에 남아 있으면
// 아무리 일해도 100%가 안 되는 분모가 된다.
async function roadmapCounts(db: DbClient, userId: string, workspaceName: string): Promise<RoadmapCounts> {
  const rows = (await getRoadmap(db, userId, workspaceName)).filter(n => n.level === "task");
  let total = 0;
  let done = 0;
  let active = 0;
  for (const r of rows) {
    const effective = r.display_status ?? r.status;
    if (effective === "dropped") continue;
    total++;
    if (effective === "done" && !isUnverifiedWorkResult(r.work_result)) done++;
    if (effective === "in_progress") active++;
  }
  return { total, done, active };
}

async function taskCounts(db: DbClient, userId: string, workspaceName: string): Promise<TaskCounts> {
  const rows = await db.query<{ status: string; n: number }>(
    "SELECT status, COUNT(*) as n FROM sugo_tasks WHERE user_id = ? AND workspace_name = ? GROUP BY status",
    [userId, workspaceName]
  );
  const counts: TaskCounts = { pending: 0, in_progress: 0, done: 0, archived: 0 };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof TaskCounts] = Number(r.n);
  }
  return counts;
}

export async function listWorkspaces(db: DbClient, userId: string): Promise<WorkspaceSummary[]> {
  // soft delete 필터. 컬럼이 없으면(코드가 마이그레이션보다 먼저 배포된 경우) 필터를 생략해
  // 전부 노출한다 — 여기서 500을 내면 대시보드 전체가 멈춘다(graceful degrade).
  const hasDeletedCol = await ensureWorkspaceDeletedAtColumn(db);
  const workspaces = await db.query<{ id: number; name: string }>(
    hasDeletedCol
      ? "SELECT id, name FROM sugo_workspaces WHERE user_id = ? AND deleted_at IS NULL ORDER BY name"
      : "SELECT id, name FROM sugo_workspaces WHERE user_id = ? ORDER BY name",
    [userId]
  );
  const result: WorkspaceSummary[] = [];
  let awsSnapshots: AwsDeploymentSnapshot[] = [];
  let pinpointSnapshots: PinpointApplicationSnapshot[] = [];
  const integrationMappings = new Map<string, ProjectIntegrationSelection[]>();
  try {
    const rows = await db.query<{ project_path: string; selections: unknown }>('SELECT project_path, selections FROM user_project_integration_mappings WHERE user_id = ?', [userId]);
    for (const row of rows) integrationMappings.set(row.project_path, parseMaybeJson(row.selections, []));
  } catch { /* Optional on older databases before schema initialization. */ }
  try {
    const rows = await db.query<{ account_name: string; region: string; payload: unknown; observed_at: string | null }>(
      `SELECT a.name AS account_name, a.region, s.payload, s.observed_at
       FROM user_aws_context_accounts a
       JOIN user_aws_context_snapshots s ON s.user_id = a.user_id AND s.account_name = a.name
       WHERE a.user_id = ?`,
      [userId],
    );
    awsSnapshots = rows.map((row) => ({
      accountName: row.account_name,
      region: row.region,
      observedAt: row.observed_at,
      inventory: parseMaybeJson(row.payload, []),
    }));
  } catch {
    // AWS Context는 선택 기능이다. 구 DB나 미연결 사용자도 Workspace 목록을 그대로 쓸 수 있어야 한다.
  }
  try {
    const rows = await db.query<{ payload: unknown }>('SELECT payload FROM user_pinpoint_snapshots WHERE user_id = ?', [userId]);
    pinpointSnapshots = rows[0] ? parseMaybeJson(rows[0].payload, []) : [];
  } catch { /* Pinpoint is optional and old databases remain readable. */ }
  for (const ws of workspaces) {
    const projectRows = await db.query<{ project_path: string; git_synced: number }>(
      "SELECT project_path, git_synced FROM sugo_workspace_projects WHERE workspace_id = ? ORDER BY project_path",
      [ws.id]
    );
    const projects: WorkspaceProjectRow[] = await Promise.all(projectRows.map(async (project) => {
      const deployments = linkAwsDeployments(project.project_path, awsSnapshots, pinpointSnapshots, integrationMappings.has(project.project_path) ? integrationMappings.get(project.project_path) : undefined);
      const release = linkAwsRelease(project.project_path, awsSnapshots);
      const [localGit, remoteGit] = await Promise.all([
        readLocalGitState(project.project_path, release?.baseBranch ?? null),
        readRemoteGitState(project.project_path),
      ]);
      return { ...project, aws_synced: deployments.length > 0 ? 1 : 0, aws_deployments: deployments, aws_release: release, local_git: localGit, remote_git: remoteGit };
    }));
    const tasks = await taskCounts(db, userId, ws.name);
    const roadmap = await roadmapCounts(db, userId, ws.name);
    const attention = await workspaceAttention(db, userId, ws.name);
    const [historyCount, checkpointCount] = await Promise.all([
      countRows(db, "sugo_history", userId, ws.name),
      db.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM sugo_checkpoints WHERE user_id = ? AND workspace_name = ? AND expires_at IS NULL",
        [userId, ws.name],
      ).then((rows) => Number(rows[0]?.count ?? 0)),
    ]);
    result.push({
      name: ws.name,
      projects,
      taskCounts: tasks,
      roadmap,
      roadmapCount: roadmap.total,
      roadmapDoneCount: roadmap.done,
      // "진행 중"의 기준은 태스크가 아니라 로드맵 노드다.
      // 카드의 "N task 진행 중" 값도 로드맵 active에서 온다.
      activeTaskCount: roadmap.active,
      historyCount,
      checkpointCount,
      projectCount: projects.length,
      attentionCount: attention.count,
      attentionLabel: attention.label,
      lastActivityAt: await lastActivityAt(db, userId, ws.name),
    });
  }
  return result;
}

async function countRows(db: DbClient, table: string, userId: string, workspaceName: string): Promise<number> {
  try {
    const rows = await db.query<{ n: number }>(
      `SELECT COUNT(*) as n FROM ${table} WHERE user_id = ? AND workspace_name = ?`,
      [userId, workspaceName]
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    // 지연생성 테이블이 아직 없을 수 있다 — 목록 화면 전체를 죽이지 않는다.
    return 0;
  }
}

/** `Recently Active (30d)` 필터 기준. history 최신 완료/생성 시각을 쓴다(활동의 실제 흔적). */
async function lastActivityAt(db: DbClient, userId: string, workspaceName: string): Promise<string | null> {
  try {
    const rows = await db.query<{ ts: string | null }>(
      "SELECT MAX(COALESCE(completed_at, created_at)) as ts FROM sugo_history WHERE user_id = ? AND workspace_name = ?",
      [userId, workspaceName]
    );
    return rows[0]?.ts ?? null;
  } catch {
    return null;
  }
}

export interface HistoryRow {
  id: string;
  workspace_name: string;
  task_id: string | null;
  task_title: string | null;
  spec_title: string | null;
  summary: string | null;
  completed_at: string | null;
  created_at: string;
}

const historySelect = `SELECT h.id, h.workspace_name, h.task_id, h.task_title,
       COALESCE(spec.manual_title, spec.title) AS spec_title,
       h.summary, h.completed_at, h.created_at
  FROM sugo_history h
  LEFT JOIN sugo_roadmap_nodes task
    ON task.user_id = h.user_id AND task.workspace_name = h.workspace_name AND task.id = h.task_id
  LEFT JOIN sugo_roadmap_nodes run
    ON run.user_id = task.user_id AND run.workspace_name = task.workspace_name AND run.id = task.parent
  LEFT JOIN sugo_roadmap_nodes spec
    ON spec.user_id = run.user_id AND spec.workspace_name = run.workspace_name
   AND spec.id = run.parent AND spec.level = 'spec'`;

export async function getRecentHistory(db: DbClient, userId: string, limit: number): Promise<HistoryRow[]> {
  return db.query<HistoryRow>(
    `${historySelect} WHERE h.user_id = ? ORDER BY h.created_at DESC LIMIT ?`,
    [userId, limit]
  );
}

export async function searchWorkspaces(db: DbClient, userId: string, q: string): Promise<HistoryRow[]> {
  const like = `%${q}%`;
  return db.query<HistoryRow>(
    `${historySelect}
     WHERE h.user_id = ? AND (h.task_title LIKE ? OR h.summary LIKE ? OR COALESCE(spec.manual_title, spec.title) LIKE ?)
     ORDER BY h.created_at DESC`,
    [userId, like, like, like]
  );
}

export interface CheckpointSyncRow {
  id: string;
  workspace_name: string;
  category: string;
  title: string;
  learned_from: string | null;
  checklist: unknown;
  applies_to: unknown;
  expires_at: string | null;
}

function normalizeCheckpointRow<T extends { checklist: unknown; applies_to: unknown }>(row: T): T {
  return { ...row, checklist: parseMaybeJson<unknown>(row.checklist, null), applies_to: parseMaybeJson<unknown>(row.applies_to, null) };
}

export async function getCheckpointSync(db: DbClient, userId: string, workspaceName?: string): Promise<CheckpointSyncRow[]> {
  const rows = await db.query<CheckpointSyncRow>(
    `SELECT id, workspace_name, category, title, learned_from, checklist, applies_to, expires_at
       FROM sugo_checkpoints
      WHERE user_id = ?${workspaceName ? " AND workspace_name = ?" : ""}
      ORDER BY workspace_name, id`,
    workspaceName ? [userId, workspaceName] : [userId]
  );
  return rows.map(normalizeCheckpointRow);
}

/**
 * "GET /:name/spec-content?path=&title= — Spec 본문(slug 매칭)". 대시보드엔 spec 파일 본문을
 * 플러그인이 동기화한 SPEC 원문에서 title 또는 id를 매칭한다. 없으면 null.
 */
export async function getSpecContent(
  db: DbClient,
  userId: string,
  workspaceName: string,
  title: string,
): Promise<{ title: string; content: string | null } | null> {
  const rows = await db.query<{ id: string; title: string; content: string | null }>(
    "SELECT id, title, content FROM sugo_specs WHERE user_id = ? AND workspace_name = ? AND (id = ? OR title = ?) LIMIT 1",
    [userId, workspaceName, title, title],
  );
  if (rows.length === 0) return null;
  return { title: rows[0].title, content: rows[0].content };
}

export async function getHistory(db: DbClient, userId: string, workspaceName: string) {
  return db.query<HistoryRow>(
    `${historySelect} WHERE h.user_id = ? AND h.workspace_name = ? ORDER BY h.created_at DESC`,
    [userId, workspaceName]
  );
}

export async function getCheckpoints(db: DbClient, userId: string, workspaceName: string) {
  const rows = await db.query<{
    id: string;
    category: string;
    title: string;
    learned_from: string | null;
    checklist: unknown;
    applies_to: unknown;
    checkpoint_date: string | null;
    created_at: string;
    expires_at: string | null;
  }>(
    "SELECT id, category, title, learned_from, checklist, applies_to, checkpoint_date, expires_at, created_at FROM sugo_checkpoints WHERE user_id = ? AND workspace_name = ? ORDER BY COALESCE(checkpoint_date, created_at), id",
    [userId, workspaceName]
  );
  return rows.map(normalizeCheckpointRow);
}

export async function getTasks(db: DbClient, userId: string, workspaceName: string) {
  return db.query(
    "SELECT id, title, project, status, priority, description, summary, started_at, completed_at FROM sugo_tasks WHERE user_id = ? AND workspace_name = ? ORDER BY created_at",
    [userId, workspaceName]
  );
}

export interface RoadmapNodeRow {
  deployment?: SpecDeployment;
  project_path?: string | null;
  updated_at: string | null;
  id: string;
  title: string;
  level: string;
  status: string;
  display_status?: string;
  depends_on: string[];
  parent: string | null;
  ref: string | null;
  note: string | null;
  spec_path: string | null;
  work_result: unknown;
  runtime_assessment: unknown;
  lineage: unknown;
  manual_status: string | null;
  manual_by: string | null;
  manual_at: string | null;
  pos_x: number | null;
  pos_y: number | null;
  due_date: string | null;
  manual_title: string | null;
  blocker_response: string | null;
  blocker_answered_by: string | null;
  blocker_answered_at: string | null;
  blocker_context: unknown;
  human_blocker?: unknown;
  blocker_decision?: { response: string; answered_by: string; answered_at: string } | null;
}

// Row shape as it comes off the wire - JSON columns are driver-dependent
// (string on sqlite, already-parsed on mysql2); normalized below so the API
// response is identical regardless of DB_DRIVER.
type RoadmapNodeDbRow = Omit<RoadmapNodeRow, "depends_on" | "work_result" | "runtime_assessment" | "lineage" | "blocker_context"> & {
  depends_on: unknown;
  work_result: unknown;
  runtime_assessment: unknown;
  lineage: unknown;
  blocker_context: unknown;
};

export async function getRoadmap(db: DbClient, userId: string, workspaceName: string): Promise<RoadmapNodeRow[]> {
  const allRows = await db.query<RoadmapNodeDbRow>(
    "SELECT * FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? ORDER BY id",
    [userId, workspaceName]
  );
  const closed = await db.query<{ spec_id: string }>(
    "SELECT spec_id FROM sugo_schedule_spec_archives WHERE user_id = ? AND workspace_name = ? AND reason = 'closed'",
    [userId, workspaceName],
  );
  const hidden = new Set(closed.map((row) => row.spec_id));
  for (let changed = true; changed;) {
    changed = false;
    for (const row of allRows) if (row.parent && hidden.has(row.parent) && !hidden.has(row.id)) {
      hidden.add(row.id);
      changed = true;
    }
  }
  const rows = allRows.filter((row) => !hidden.has(row.id));
  // manual_status와 달리 manual_title은 서버에서 곧바로 유효 title로 합친다 — Canvas의
  // n.title 참조가 수십 곳이라 프론트에 매번 manual_title ?? title 판정을 시키는 대신,
  // CLI 원래 제목을 따로 보여줄 UI가 없다는 전제로 여기서 한 번에 정리한다.
  const nodes = await Promise.all(rows.map(async (r) => {
    const lineage = parseMaybeJson<Array<Record<string, unknown>> | null>(r.lineage, null);
    const projectedLineage = lineage && await Promise.all(lineage.map(async entry => entry.workResult
      ? { ...entry, workResult: await projectHumanCompletion(db, userId, workspaceName, r.id, entry.workResult) }
      : entry));
    return ({
    ...r,
    title: r.manual_title ?? r.title,
    depends_on: parseJsonArray(r.depends_on),
    work_result: await projectHumanCompletion(db, userId, workspaceName, r.id, r.work_result),
    runtime_assessment: parseMaybeJson<unknown>(r.runtime_assessment, null),
    lineage: projectedLineage,
    human_blocker: parseMaybeJson<unknown>(r.blocker_context, null),
    blocker_decision: r.blocker_response && r.blocker_answered_by && r.blocker_answered_at
      ? { response: r.blocker_response, answered_by: r.blocker_answered_by, answered_at: r.blocker_answered_at }
      : null,
    });
  }));
  const displayed = nodes.map(n => ({ ...n, display_status: n.manual_status ?? (n.level === "task" ? projectedTaskStatus(n.status, n.runtime_assessment, n.work_result) : n.status) }));
  for (const n of displayed) {
    if (n.level === "task" && n.display_status === "done" && isUnverifiedWorkResult(n.work_result)) n.display_status = "verification";
  }
  // A finished pipeline can still require human verification. Containers surface that outstanding work.
  const byId = new Map(displayed.map(n => [n.id, n]));
  for (const n of displayed.filter(n => n.level === "spec" || n.level === "workstream")) {
    if (n.display_status === "dropped" || n.display_status === "blocked") continue;
    const descendants = displayed.filter(t => {
      if (t.level !== "task" || t.display_status === "dropped") return false;
      const seen = new Set<string>(); let parent = t.parent;
      while (parent && !seen.has(parent)) { if (parent === n.id) return true; seen.add(parent); parent = byId.get(parent)?.parent ?? null; }
      return false;
    });
    const unfinished = descendants.filter(t => t.display_status !== "done");
    if (descendants.length > 0 && unfinished.length === 0) {
      n.display_status = "done";
      continue;
    }
    if (!unfinished.length) continue;
    if (unfinished.some(t => t.display_status === "blocked")) n.display_status = "blocked";
    else if (unfinished.some(t => t.display_status === "in_progress")) n.display_status = "in_progress";
    else if (unfinished.some(t => t.display_status === "verification")) n.display_status = "verification";
    else if (n.display_status === "done") n.display_status = "pending";
  }
  const deployments = await projectSpecDeployments(db, userId, workspaceName, displayed);
  return displayed.map(n => ({ ...n, ...(deployments.has(n.id) ? { deployment: deployments.get(n.id)! } : {}) }));
}

export type SaveBlockerDecisionResult =
  | { ok: true; decision: { response: string; answered_by: string; answered_at: string } }
  | { ok: false; errorCode: "NODE_NOT_FOUND" | "TASK_NOT_BLOCKED"; message: string };

export async function saveBlockerDecision(
  db: DbClient, userId: string, workspaceName: string, nodeId: string, response: string
): Promise<SaveBlockerDecisionResult> {
  const rows = await db.query<{ level: string; status: string; manual_status: string | null }>(
    "SELECT level, status, manual_status FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
  const node = rows[0];
  if (!node || node.level !== "task") return { ok: false, errorCode: "NODE_NOT_FOUND", message: "Task를 찾을 수 없습니다." };
  if ((node.manual_status ?? node.status) !== "blocked") {
    return { ok: false, errorCode: "TASK_NOT_BLOCKED", message: "차단된 Task에만 결정을 저장할 수 있습니다." };
  }
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET blocker_response = ?, blocker_answered_by = ?, blocker_answered_at = CURRENT_TIMESTAMP WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [response.trim(), userId, userId, workspaceName, nodeId]
  );
  const saved = (await db.query<{ blocker_response: string; blocker_answered_by: string; blocker_answered_at: string }>(
    "SELECT blocker_response, blocker_answered_by, blocker_answered_at FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  ))[0];
  return { ok: true, decision: { response: saved.blocker_response, answered_by: saved.blocker_answered_by, answered_at: saved.blocker_answered_at } };
}

export async function getBlockerDecision(db: DbClient, userId: string, workspaceName: string, nodeId: string) {
  const rows = await db.query<{
    level: string; status: string; manual_status: string | null; blocker_response: string | null;
    blocker_answered_by: string | null; blocker_answered_at: string | null; blocker_context: unknown;
  }>(
    "SELECT level, status, manual_status, blocker_response, blocker_answered_by, blocker_answered_at, blocker_context FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
  const node = rows[0];
  if (!node || node.level !== "task") return null;
  return {
    status: node.manual_status ?? node.status,
    blocker: parseMaybeJson<unknown>(node.blocker_context, null),
    decision: node.blocker_response && node.blocker_answered_by && node.blocker_answered_at
      ? { response: node.blocker_response, answered_by: node.blocker_answered_by, answered_at: node.blocker_answered_at }
      : null,
  };
}

// ---- Schedule 탭 (due_date는 dashboard 전용, CLI/플러그인 sync가 안 건드림) ----

export interface ScheduledSpecRow {
  deployment?: SpecDeployment;
  id: string;
  workspace_name: string;
  title: string;
  status: string;
  due_date: string | null;
  project_path: string | null;
  work_branch: string | null;
  spec_path: string | null;
  has_run: boolean;
  task_count: number;
  done_task_count: number;
  active_task_count: number;
  blocked_task_count: number;
  stale_task_count: number;
  unverified_task_count: number;
  focus_task_id: string | null;
  focus_task_title: string | null;
  focus_task_status: string | null;
  focus_task_note: string | null;
  focus_task_updated_at: string | null;
  focus_task_work_result: unknown;
  focus_task_runtime_assessment: unknown;
  focus_task_blocker_decision: { response: string; answered_by: string; answered_at: string } | null;
  focus_task_human_blocker: unknown;
  development_history: Array<{ task_id: string; version: number; title: string; summary: string | null; completed_at: string | null; work_result_path: string | null; work_result: Record<string, unknown> | null }>;
}

/** 로그인 사용자의 전체 워크스페이스에서 level='spec' 노드 전부(due_date NULL 포함)를 반환한다.
 * 프론트가 due_date 유무로 캘린더/"기한 미정" 리스트를 나눈다. */
export async function getScheduledSpecs(db: DbClient, userId: string): Promise<ScheduledSpecRow[]> {
  const rows = await db.query<Omit<ScheduledSpecRow, "has_run" | "task_count" | "done_task_count" | "active_task_count" | "blocked_task_count" | "stale_task_count" | "unverified_task_count" | "focus_task_id" | "focus_task_title" | "focus_task_status" | "focus_task_note" | "focus_task_updated_at" | "focus_task_work_result" | "focus_task_runtime_assessment" | "focus_task_blocker_decision" | "focus_task_human_blocker"> & { manual_title: string | null; has_run: number | boolean }>(
    `SELECT n.id, n.workspace_name, n.title, n.manual_title,
            COALESCE(n.manual_status, n.status) AS status, n.due_date, n.project_path, n.work_branch, n.spec_path,
            EXISTS (SELECT 1 FROM sugo_roadmap_nodes child
                     WHERE child.user_id = n.user_id AND child.workspace_name = n.workspace_name
                       AND child.parent = n.id AND child.level = 'workstream') AS has_run
       FROM sugo_roadmap_nodes n
       LEFT JOIN sugo_workspaces w ON w.user_id = n.user_id AND w.name = n.workspace_name
      WHERE n.user_id = ? AND n.level = 'spec' AND (w.id IS NULL OR w.deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM sugo_schedule_spec_archives a
                         WHERE a.user_id = n.user_id AND a.workspace_name = n.workspace_name AND a.spec_id = n.id)
      ORDER BY (n.due_date IS NULL), n.due_date, n.id`,
    [userId]
  );
  const tasks = await db.query<{
    workspace_name: string; spec_id: string; id: string; title: string; status: string; manual_status: string | null;
    note: string | null; updated_at: string | null; work_result: unknown; lineage: unknown; runtime_assessment: unknown; blocker_response: string | null; blocker_answered_by: string | null; blocker_answered_at: string | null; blocker_context: unknown;
  }>(
    `SELECT task.workspace_name, run.parent AS spec_id, task.id, task.title, task.status, task.manual_status,
            task.note, task.updated_at, task.work_result, task.lineage, task.runtime_assessment, task.blocker_response, task.blocker_answered_by, task.blocker_answered_at, task.blocker_context
       FROM sugo_roadmap_nodes task
       JOIN sugo_roadmap_nodes run
         ON run.user_id = task.user_id AND run.workspace_name = task.workspace_name AND run.id = task.parent
      WHERE task.user_id = ? AND task.level = 'task' AND run.level = 'workstream'`,
    [userId]
  );
  for (const task of tasks) task.work_result = await projectHumanCompletion(db, userId, task.workspace_name, task.id, task.work_result);
  const tasksBySpec = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const key = `${task.workspace_name}\0${task.spec_id}`;
    tasksBySpec.set(key, [...(tasksBySpec.get(key) ?? []), task]);
  }
  // manual_title(Canvas 이름 변경)이 있으면 그게 유효 제목 — CLI가 push한 title은 다음
  // sync에서 되돌아오므로 화면 표시에는 절대 그대로 쓰지 않는다.
  const deployments = new Map<string, SpecDeployment>();
  await Promise.all([...new Set(rows.map(r => r.workspace_name))].map(async workspace => {
    for (const n of await getRoadmap(db, userId, workspace)) if (n.deployment) deployments.set(`${workspace}\0${n.id}`, n.deployment);
  }));
  return rows.map(({ manual_title, has_run, ...row }) => {
    const children = tasksBySpec.get(`${row.workspace_name}\0${row.id}`) ?? [];
    const enriched = children.map((task) => {
      const raw = task.manual_status ?? projectedTaskStatus(task.status, task.runtime_assessment, task.work_result);
      const unverified = isUnverifiedWorkResult(task.work_result);
      const status = raw === "done" && unverified ? "verification" : raw;
      return { ...task, status, stale: isStale(status, task.updated_at), unverified };
    });
    const priority = (task: (typeof enriched)[number]) => task.status === "blocked" ? 0 : task.stale ? 1 : task.status === "in_progress" ? 2 : task.unverified ? 3 : task.status === "pending" ? 4 : 5;
    const focus = [...enriched].sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id))[0] ?? null;
    const developmentHistory = enriched.flatMap((task) => {
      const entries = parseMaybeJson<Array<Record<string, unknown>> | null>(task.lineage, null) ?? [];
      return entries.map((entry, index) => {
        const version = Number.isFinite(Number(entry.version)) ? Number(entry.version) : index;
        const workResult = entry.workResult && typeof entry.workResult === "object" ? entry.workResult as Record<string, unknown> : null;
        const summary = typeof entry.summary === "string" ? entry.summary : typeof workResult?.summary === "string" ? workResult.summary : null;
        return {
          task_id: task.id,
          version,
          title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : task.title,
          summary,
          completed_at: typeof entry.completedAt === "string" ? entry.completedAt : null,
          work_result_path: typeof workResult?.path === "string" ? workResult.path : null,
          work_result: workResult,
        };
      });
    }).sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? "") || a.version - b.version);
    return {
      ...row,
      deployment: deployments.get(`${row.workspace_name}\0${row.id}`),
      status: row.status === "dropped" ? "dropped" : enriched.some(t => t.status === "blocked") ? "blocked" : enriched.some(t => t.status === "in_progress") ? "in_progress" : enriched.some(t => t.status === "verification") ? "verification" : enriched.length > 0 && enriched.every(t => t.status === "done") ? "done" : row.status === "done" && enriched.some(t => t.status === "pending") ? "pending" : row.status,
      has_run: Boolean(has_run),
      title: manual_title ?? row.title,
      task_count: enriched.length,
      done_task_count: enriched.filter((task) => task.status === "done").length,
      active_task_count: enriched.filter((task) => task.status === "in_progress").length,
      blocked_task_count: enriched.filter((task) => task.status === "blocked").length,
      stale_task_count: enriched.filter((task) => task.stale).length,
      unverified_task_count: enriched.filter((task) => task.unverified).length,
      focus_task_id: focus?.id ?? null,
      focus_task_title: focus?.title ?? null,
      focus_task_status: focus?.status ?? null,
      focus_task_note: focus?.note ?? null,
      focus_task_updated_at: focus?.updated_at ?? null,
      focus_task_work_result: parseMaybeJson(focus?.work_result, null),
      focus_task_runtime_assessment: parseMaybeJson(focus?.runtime_assessment, null),
      focus_task_blocker_decision: focus?.blocker_response && focus.blocker_answered_by && focus.blocker_answered_at
        ? { response: focus.blocker_response, answered_by: focus.blocker_answered_by, answered_at: focus.blocker_answered_at }
        : null,
      focus_task_human_blocker: parseMaybeJson(focus?.blocker_context, null),
      development_history: developmentHistory,
    };
  });
}

export type SetSpecDocumentResult =
  | { ok: true }
  | { ok: false; errorCode: "NODE_NOT_FOUND" | "INVALID_LEVEL" | "SPEC_LOCKED_AFTER_FEAT" };

/** spec-writer가 만든 원문을 Schedule SPEC에 연결한다. 첫 RUN이 생긴 뒤에는 원문을 불변으로 잠근다. */
export async function setRoadmapSpecDocument(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  specPath: string
): Promise<SetSpecDocumentResult> {
  const rows = await db.query<{ level: string }>(
    "SELECT level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
  if (rows.length === 0) return { ok: false, errorCode: "NODE_NOT_FOUND" };
  if (rows[0].level !== "spec") return { ok: false, errorCode: "INVALID_LEVEL" };
  const children = await db.query<{ id: string }>(
    "SELECT id FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND parent = ? AND level = 'workstream' LIMIT 1",
    [userId, workspaceName, nodeId]
  );
  if (children.length > 0) return { ok: false, errorCode: "SPEC_LOCKED_AFTER_FEAT" };
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET spec_path = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [specPath, userId, workspaceName, nodeId]
  );
  return { ok: true };
}

type SpecDocumentError = "NODE_NOT_FOUND" | "INVALID_LEVEL" | "SPEC_DOCUMENT_NOT_LINKED" | "SPEC_FILE_NOT_FOUND";

export type SpecDocumentResult =
  | { ok: true; specPath: string; content: string; locked: boolean }
  | { ok: false; errorCode: SpecDocumentError };

type SpecNodeState =
  | { ok: true; specPath: string; locked: boolean }
  | { ok: false; errorCode: "NODE_NOT_FOUND" | "INVALID_LEVEL" | "SPEC_DOCUMENT_NOT_LINKED" };

async function specNodeState(db: DbClient, userId: string, workspaceName: string, nodeId: string): Promise<SpecNodeState> {
  const rows = await db.query<{ level: string; spec_path: string | null }>(
    "SELECT level, spec_path FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId],
  );
  if (rows.length === 0) return { ok: false, errorCode: "NODE_NOT_FOUND" };
  if (rows[0].level !== "spec") return { ok: false, errorCode: "INVALID_LEVEL" };
  if (!rows[0].spec_path) return { ok: false, errorCode: "SPEC_DOCUMENT_NOT_LINKED" };
  const children = await db.query<{ id: string }>(
    "SELECT id FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND parent = ? AND level = 'workstream' LIMIT 1",
    [userId, workspaceName, nodeId],
  );
  return { ok: true, specPath: rows[0].spec_path, locked: children.length > 0 };
}

/** 연결된 SPEC 원문만 읽는다. 요청에서 임의 파일 경로를 받지 않아 로컬 파일 탐색 API가 되지 않는다. */
export async function getRoadmapSpecDocument(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
): Promise<SpecDocumentResult> {
  const state = await specNodeState(db, userId, workspaceName, nodeId);
  if (!state.ok) return { ok: false, errorCode: state.errorCode };
  if (!isAbsolute(state.specPath) || extname(state.specPath).toLowerCase() !== ".md") {
    return { ok: false, errorCode: "SPEC_FILE_NOT_FOUND" };
  }
  const content = await readFile(state.specPath, "utf8").catch(() => null);
  if (content === null) return { ok: false, errorCode: "SPEC_FILE_NOT_FOUND" };
  return { ok: true, specPath: state.specPath, content, locked: state.locked };
}

const SPEC_ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** spec.md가 상대경로로 참조한 이미지. 연결된 spec.md 디렉터리 안의 이미지 파일만 읽는다. */
export async function readRoadmapSpecDocumentAsset(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  assetPath: string,
): Promise<{ ok: true; data: Buffer; ext: string } | { ok: false; errorCode: SpecDocumentError | "ASSET_NOT_FOUND" }> {
  const state = await specNodeState(db, userId, workspaceName, nodeId);
  if (!state.ok) return { ok: false, errorCode: state.errorCode };
  if (!isAbsolute(state.specPath)) return { ok: false, errorCode: "SPEC_FILE_NOT_FOUND" };
  const base = dirname(state.specPath);
  const target = resolve(base, assetPath);
  const ext = extname(target).toLowerCase();
  if (isAbsolute(assetPath) || !target.startsWith(base + sep) || !SPEC_ASSET_EXTENSIONS.has(ext)) {
    return { ok: false, errorCode: "ASSET_NOT_FOUND" };
  }
  const data = await readFile(target).catch(() => null);
  if (!data) return { ok: false, errorCode: "ASSET_NOT_FOUND" };
  return { ok: true, data, ext: ext.slice(1) };
}

export type UpdateSpecDocumentResult =
  | { ok: true; specPath: string; content: string; locked: false }
  | { ok: false; errorCode: SpecDocumentError | "SPEC_LOCKED_AFTER_FEAT" };

/** feat 전 원문 수정. 같은 디렉터리의 임시 파일을 rename해 중간 저장 실패 시 원문을 보존한다. */
export async function updateRoadmapSpecDocument(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  content: string,
): Promise<UpdateSpecDocumentResult> {
  const state = await specNodeState(db, userId, workspaceName, nodeId);
  if (!state.ok) return { ok: false, errorCode: state.errorCode };
  if (state.locked) return { ok: false, errorCode: "SPEC_LOCKED_AFTER_FEAT" };
  if (!isAbsolute(state.specPath) || extname(state.specPath).toLowerCase() !== ".md") {
    return { ok: false, errorCode: "SPEC_FILE_NOT_FOUND" };
  }
  const existing = await readFile(state.specPath, "utf8").catch(() => null);
  if (existing === null) return { ok: false, errorCode: "SPEC_FILE_NOT_FOUND" };
  const tempPath = join(dirname(state.specPath), `.${basename(state.specPath)}.sugo-edit-${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(tempPath, content, "utf8");
    await renameFile(tempPath, state.specPath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
  return { ok: true, specPath: state.specPath, content, locked: false };
}

export type SetDueDateResult = { ok: true } | { ok: false; errorCode: "NODE_NOT_FOUND" | "INVALID_LEVEL" };

/** level='spec' 노드에만 due_date를 붙인다. 다른 level에 시도하면 INVALID_LEVEL. */
export async function setRoadmapDueDate(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  dueDate: string | null
): Promise<SetDueDateResult> {
  const rows = await db.query<{ level: string }>(
    "SELECT level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
  if (rows.length === 0) return { ok: false, errorCode: "NODE_NOT_FOUND" };
  if (rows[0].level !== "spec") return { ok: false, errorCode: "INVALID_LEVEL" };
  await db.exec("UPDATE sugo_roadmap_nodes SET due_date = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    dueDate,
    userId,
    workspaceName,
    nodeId,
  ]);
  return { ok: true };
}

/** level='spec' 노드에만 project_path를 붙인다. setRoadmapDueDate와 같은 모양. */
export async function setRoadmapProject(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  projectPath: string | null
): Promise<SetDueDateResult> {
  const rows = await db.query<{ level: string }>(
    "SELECT level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
  if (rows.length === 0) return { ok: false, errorCode: "NODE_NOT_FOUND" };
  if (rows[0].level !== "spec") return { ok: false, errorCode: "INVALID_LEVEL" };
  await db.exec("UPDATE sugo_roadmap_nodes SET project_path = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    projectPath,
    userId,
    workspaceName,
    nodeId,
  ]);
  return { ok: true };
}

export async function setRoadmapWorkBranch(
  db: DbClient, userId: string, workspaceName: string, nodeId: string, workBranch: string | null
): Promise<SetDueDateResult> {
  const rows = await db.query<{ level: string }>(
    "SELECT level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
  if (rows.length === 0) return { ok: false, errorCode: "NODE_NOT_FOUND" };
  if (rows[0].level !== "spec") return { ok: false, errorCode: "INVALID_LEVEL" };
  await db.exec("UPDATE sugo_roadmap_nodes SET work_branch = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    workBranch, userId, workspaceName, nodeId,
  ]);
  return { ok: true };
}

/** Run/Task 없이 level='spec' 노드만 단독 생성한다. 사용자가 정식 feat 착수 전에
 * 일정만 먼저 잡아둘 때 쓴다. */
export async function createQuickSpec(
  db: DbClient,
  userId: string,
  workspaceName: string,
  title: string,
  dueDate: string | null,
  projectPath: string | null
): Promise<{ id: string }> {
  const id = `spec-manual-${randomBytes(4).toString("hex")}`;
  await db.exec(
    "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, due_date, project_path) VALUES (?, ?, ?, ?, 'spec', 'pending', ?, ?)",
    [id, userId, workspaceName, title, dueDate, projectPath]
  );
  return { id };
}

export type DeleteQuickSpecResult =
  | { ok: true; deletedCount: number; filesPreserved: true }
  | { ok: false; errorCode: "NODE_NOT_FOUND" | "INVALID_LEVEL" | "NOT_MANUAL_SPEC" };

/** Dashboard에서 만든 경량 SPEC만 영구 삭제한다. 연결된 RUN/Task 계보는 함께 제거하지만,
 * spec_path가 가리키는 로컬 Markdown은 사용자 파일이므로 절대 지우지 않는다. */
export async function deleteQuickSpec(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
): Promise<DeleteQuickSpecResult> {
  const rows = await db.query<{ id: string; level: string; parent: string | null; depends_on: unknown }>(
    "SELECT id, level, parent, depends_on FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName],
  );
  const root = rows.find((row) => row.id === nodeId);
  if (!root) return { ok: false, errorCode: "NODE_NOT_FOUND" };
  if (root.level !== "spec") return { ok: false, errorCode: "INVALID_LEVEL" };
  if (!root.id.startsWith("spec-manual-")) return { ok: false, errorCode: "NOT_MANUAL_SPEC" };

  const deleting = new Set([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parent && deleting.has(row.parent) && !deleting.has(row.id)) {
        deleting.add(row.id);
        changed = true;
      }
    }
  }

  // 외부 노드가 삭제 계보를 의존하고 있으면 dangling 참조를 남기지 않는다.
  for (const row of rows) {
    if (deleting.has(row.id)) continue;
    const dependencies = parseMaybeJson<string[]>(row.depends_on, []);
    const filtered = dependencies.filter((id) => !deleting.has(id));
    if (filtered.length !== dependencies.length) {
      await db.exec(
        "UPDATE sugo_roadmap_nodes SET depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
        [JSON.stringify(filtered), userId, workspaceName, row.id],
      );
    }
  }
  // 자식부터 지우면 향후 FK가 추가돼도 계보 삭제 순서가 안전하다.
  for (const id of [...deleting].reverse()) {
    await db.exec("DELETE FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?", [userId, workspaceName, id]);
  }
  return { ok: true, deletedCount: deleting.size, filesPreserved: true };
}

// ---- Checkpoint CRUD ----

export interface CreateCheckpointInput {
  id?: string;
  category?: string;
  title: string;
  learnedFrom?: string | null;
  checklist?: unknown;
  appliesTo?: unknown;
  checkpointDate?: string | null;
  expiresAt?: string | null;
}

export async function createCheckpoint(
  db: DbClient,
  userId: string,
  workspaceName: string,
  input: CreateCheckpointInput
): Promise<string> {
  if (!input.id) throw new Error("checkpoint id required");
  // created_at을 명시적으로 CURRENT_TIMESTAMP로 찍는다 — ALTER로 자가보강된 컬럼은(마이그레이션
  // 이전부터 있던 DB) 컬럼 자체 DEFAULT가 없어서(위 ensureCheckpointCreatedAtColumn 주석 참고),
  // INSERT에서 값을 안 주면 NULL로 남는다. CREATE TABLE의 DEFAULT는 신규 설치에만 해당한다.
  await db.exec(
    `INSERT INTO sugo_checkpoints
     (id, user_id, workspace_name, category, title, learned_from, checklist, applies_to, checkpoint_date, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      input.id,
      userId,
      workspaceName,
      input.category ?? "general",
      input.title,
      input.learnedFrom ?? null,
      input.checklist !== undefined ? JSON.stringify(input.checklist) : null,
      input.appliesTo !== undefined ? JSON.stringify(input.appliesTo) : null,
      input.checkpointDate ?? null,
      input.expiresAt ?? null,
    ]
  );
  return input.id;
}

export async function getWorkspaceProjectPaths(db: DbClient, userId: string, workspaceName: string): Promise<string[]> {
  const rows = await db.query<{ project_path: string }>(
    `SELECT p.project_path FROM sugo_workspace_projects p
       JOIN sugo_workspaces w ON w.id = p.workspace_id
      WHERE w.user_id = ? AND w.name = ? ORDER BY p.project_path`,
    [userId, workspaceName],
  );
  return rows.map((row) => row.project_path);
}

export async function updateCheckpoint(
  db: DbClient,
  userId: string,
  workspaceName: string,
  id: string,
  input: Partial<CreateCheckpointInput>
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.category !== undefined) { sets.push("category = ?"); params.push(input.category); }
  if (input.title !== undefined) { sets.push("title = ?"); params.push(input.title); }
  if (input.learnedFrom !== undefined) { sets.push("learned_from = ?"); params.push(input.learnedFrom); }
  if (input.checklist !== undefined) { sets.push("checklist = ?"); params.push(JSON.stringify(input.checklist)); }
  if (input.appliesTo !== undefined) { sets.push("applies_to = ?"); params.push(JSON.stringify(input.appliesTo)); }
  if (input.checkpointDate !== undefined) { sets.push("checkpoint_date = ?"); params.push(input.checkpointDate); }
  if (input.expiresAt !== undefined) { sets.push("expires_at = ?"); params.push(input.expiresAt); }
  if (sets.length === 0) return;
  params.push(userId, workspaceName, id);
  await db.exec(
    `UPDATE sugo_checkpoints SET ${sets.join(", ")} WHERE user_id = ? AND workspace_name = ? AND id = ?`,
    params
  );
}

export async function deleteCheckpointRow(
  db: DbClient,
  userId: string,
  workspaceName: string,
  id: string
): Promise<void> {
  await db.exec("DELETE FROM sugo_checkpoints WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

// ---- Roadmap mutations ----

export type RoadmapMutationResult = { ok: true } | { ok: false; error: string; message: string };

async function loadGraphNodes(db: DbClient, userId: string, workspaceName: string) {
  const rows = await db.query<{ id: string; level: string; status: string; depends_on: unknown }>(
    "SELECT id, level, status, depends_on FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName]
  );
  return rows.map((r) => ({ id: r.id, level: r.level, status: r.status, dependsOn: parseJsonArray(r.depends_on) }));
}

// link/unlink는 task<->task만 허용(fail-closed), 사이클 생기면 거부.
export async function linkRoadmapNodes(
  db: DbClient,
  userId: string,
  workspaceName: string,
  fromId: string,
  toId: string
): Promise<RoadmapMutationResult> {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  const from = nodes.find((n) => n.id === fromId);
  const to = nodes.find((n) => n.id === toId);
  if (!from || !to) {
    return { ok: false, error: "NODE_NOT_FOUND", message: "fromId/toId 노드를 찾을 수 없습니다." };
  }
  if (from.level !== "task" || to.level !== "task") {
    return { ok: false, error: "LINK_REQUIRES_TASK_LEVEL", message: "link/unlink는 task 레벨 노드끼리만 허용됩니다." };
  }
  if (from.dependsOn.includes(toId)) return { ok: true };

  if (wouldCreateCycle(nodes, fromId, toId)) {
    return { ok: false, error: "CYCLE", message: `링크를 추가하면 사이클이 생깁니다: ${fromId} -> ${toId}` };
  }

  const newDeps = [...from.dependsOn, toId];
  await db.exec("UPDATE sugo_roadmap_nodes SET depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    JSON.stringify(newDeps),
    userId,
    workspaceName,
    fromId,
  ]);
  return { ok: true };
}

export async function unlinkRoadmapNodes(
  db: DbClient,
  userId: string,
  workspaceName: string,
  fromId: string,
  toId: string
): Promise<RoadmapMutationResult> {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  const from = nodes.find((n) => n.id === fromId);
  if (!from) {
    return { ok: false, error: "NODE_NOT_FOUND", message: "fromId 노드를 찾을 수 없습니다." };
  }
  const newDeps = from.dependsOn.filter((id) => id !== toId);
  await db.exec("UPDATE sugo_roadmap_nodes SET depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    JSON.stringify(newDeps),
    userId,
    workspaceName,
    fromId,
  ]);
  return { ok: true };
}

// group으로 workstream 묶기: 새 workstream 노드를 만들고 멤버들의 parent를 그 그룹으로.
// sequential이면 멤버 순서대로 dependsOn 체인을 건다(task 레벨 멤버만 해당).
export async function createRoadmapGroup(
  db: DbClient,
  userId: string,
  workspaceName: string,
  groupId: string,
  title: string,
  members: string[],
  sequential: boolean
): Promise<RoadmapMutationResult> {
  await db.exec(
    "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status) VALUES (?, ?, ?, ?, 'workstream', 'pending')",
    [groupId, userId, workspaceName, title]
  );
  for (const memberId of members) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET parent = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
      [groupId, userId, workspaceName, memberId]
    );
  }
  if (sequential) {
    for (let i = 1; i < members.length; i++) {
      await linkRoadmapNodes(db, userId, workspaceName, members[i], members[i - 1]);
    }
  }
  return { ok: true };
}

export async function deleteRoadmapGroup(
  db: DbClient,
  userId: string,
  workspaceName: string,
  groupId: string
): Promise<void> {
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET parent = NULL WHERE user_id = ? AND workspace_name = ? AND parent = ?",
    [userId, workspaceName, groupId]
  );
  await db.exec("DELETE FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    groupId,
  ]);
}

export async function setRoadmapParent(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  parentId: string | null
): Promise<void> {
  await db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    parentId,
    userId,
    workspaceName,
    nodeId,
  ]);
}

/**
 * manual_status와 같은 오버레이 패턴 — 원래 `title`(CLI 진실)은 그대로 두고 `manual_title`에만
 * 쓴다. `title` 자체를 덮어쓰면 다음 CLI 재동기화(syncRoadmap)가 원래 제목으로 되돌려버린다.
 * 읽는 쪽은 전부 `manual_title ?? title`로 유효값을 판정한다.
 */
export async function renameRoadmapNode(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  title: string
): Promise<void> {
  await db.exec("UPDATE sugo_roadmap_nodes SET manual_title = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    title,
    userId,
    workspaceName,
    nodeId,
  ]);
}

// manual_status/manual_by/manual_at는 대시보드 소유 - sync가 절대 안 건드리는 컬럼.
export async function setManualStatus(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  status: string,
  manualBy: string
): Promise<void> {
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET manual_status = ?, manual_by = ?, manual_at = CURRENT_TIMESTAMP WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [status, manualBy, userId, workspaceName, nodeId]
  );
}

export async function clearManualStatus(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string
): Promise<void> {
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET manual_status = NULL, manual_by = NULL, manual_at = NULL WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
}

export async function setRoadmapPosition(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  x: number,
  y: number
): Promise<void> {
  await db.exec("UPDATE sugo_roadmap_nodes SET pos_x = ?, pos_y = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    x,
    y,
    userId,
    workspaceName,
    nodeId,
  ]);
}

export async function getReadySet(db: DbClient, userId: string, workspaceName: string): Promise<string[]> {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  return readySet(nodes.map((n) => ({ id: n.id, dependsOn: n.dependsOn, status: n.status })));
}

export async function getTopoOrder(db: DbClient, userId: string, workspaceName: string) {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  return topoSort(nodes.map((n) => ({ id: n.id, dependsOn: n.dependsOn, status: n.status })));
}

// ── 폐기(discard) — 삭제가 아니라 dropped 재활용 ──────────────────────────

export interface SubtreeResult {
  ok: boolean;
  errorCode?: "NODE_NOT_FOUND" | "SUBTREE_HAS_DONE_TASK";
  message?: string;
  affected: string[];
}

interface SubtreeRow {
  id: string;
  parent: string | null;
  status: string;
  manual_status: string | null;
}

/**
 * rootId에서 parent 링크를 따라 내려가며 BFS로 자손을 모은다. **방문 집합으로 사이클을 흡수한다** —
 * parent는 대시보드에서 사람이 편집할 수 있어 데이터가 항상 트리라는 보장이 없고, 여기서 루프에
 * 빠지면 요청 하나가 프로세스를 잡아먹는다.
 */
function collectSubtree(rows: SubtreeRow[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parent === null) continue;
    const list = childrenOf.get(r.parent) ?? [];
    list.push(r.id);
    childrenOf.set(r.parent, list);
  }
  const seen = new Set<string>([rootId]);
  const order: string[] = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      order.push(child);
      queue.push(child);
    }
  }
  return order;
}

async function loadSubtreeRows(db: DbClient, userId: string, workspaceName: string): Promise<SubtreeRow[]> {
  return db.query<SubtreeRow>(
    "SELECT id, parent, status, manual_status FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName]
  );
}

/**
 * `dropSubtree` — 노드를 **지우지 않고** `manual_status='dropped'`를 root + 전 자손에 cascade한다.
 *
 * DELETE로 만들면 이력이 소실되고 되돌릴 수 없다. 폐기는 "이건 안 한다"는 판단일 뿐이라 복구
 * 가능해야 하고, 진행률 분모에서만 빠지면 된다.
 *
 * **완료된 task가 하위에 있으면 차단한다.** 이미 한 일을 "없던 일"로 만들면 진행률·이력이 거짓이
 * 된다. 부분 적용도 하지 않는다 — 하나라도 걸리면 아무 것도 안 바꾸고 거부한다.
 */
export async function dropSubtree(
  db: DbClient,
  userId: string,
  workspaceName: string,
  rootId: string,
  manualBy: string
): Promise<SubtreeResult> {
  const rows = await loadSubtreeRows(db, userId, workspaceName);
  if (!rows.some((r) => r.id === rootId)) {
    return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${rootId}`, affected: [] };
  }

  const ids = collectSubtree(rows, rootId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const doneTask = ids
    .map((id) => byId.get(id)!)
    .find((r) => (r.manual_status ?? r.status) === "done");
  if (doneTask) {
    return {
      ok: false,
      errorCode: "SUBTREE_HAS_DONE_TASK",
      message: `하위에 완료된 항목이 있어 폐기할 수 없습니다: ${doneTask.id}`,
      affected: [],
    };
  }

  for (const id of ids) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET manual_status = 'dropped', manual_by = ?, manual_at = CURRENT_TIMESTAMP WHERE user_id = ? AND workspace_name = ? AND id = ?",
      [manualBy, userId, workspaceName, id]
    );
  }
  return { ok: true, affected: ids };
}

/**
 * `restoreSubtree` — **`manual_status='dropped'`인 것만** NULL로 되돌린다.
 * 사람이 손으로 찍은 다른 override(예: `done`)는 폐기와 무관하므로 보존한다 — 복구가 다른
 * 수동 판단까지 지워버리면 그건 복구가 아니라 또 다른 손실이다.
 */
export async function restoreSubtree(
  db: DbClient,
  userId: string,
  workspaceName: string,
  rootId: string
): Promise<SubtreeResult> {
  const rows = await loadSubtreeRows(db, userId, workspaceName);
  if (!rows.some((r) => r.id === rootId)) {
    return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${rootId}`, affected: [] };
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const affected = collectSubtree(rows, rootId).filter((id) => byId.get(id)?.manual_status === "dropped");
  for (const id of affected) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET manual_status = NULL, manual_by = NULL, manual_at = NULL WHERE user_id = ? AND workspace_name = ? AND id = ?",
      [userId, workspaceName, id]
    );
  }
  return { ok: true, affected };
}

// ── orphan RUN → Spec 편입/분리 + run- 접두어 ────────────────────────────

export interface AssignRunResult {
  ok: boolean;
  errorCode?: "NODE_NOT_FOUND" | "NOT_A_RUN" | "NOT_A_SPEC" | "SELF_PARENT";
  message?: string;
}

/**
 * `assignRunToSpec` — orphan RUN을 Spec에 편입하거나(`specId`) 분리한다(`null`).
 *
 * **task 잠금과 달리 RUN은 재편입을 허용한다.** task는 소속이 정해지면 이력이 그 밑에 쌓이지만,
 * RUN(feat/patch 실행 단위)은 나중에 "이건 저 Spec 일이었다"고 재분류하는 게 정상 흐름이다.
 * 대신 level은 fail-closed로 검사한다 — 아무 노드나 아무 데나 붙이면 계층이 무의미해진다.
 */
export async function assignRunToSpec(
  db: DbClient,
  userId: string,
  workspaceName: string,
  runId: string,
  specId: string | null
): Promise<AssignRunResult> {
  if (specId !== null && specId === runId) {
    return { ok: false, errorCode: "SELF_PARENT", message: "자기 자신을 부모로 지정할 수 없습니다." };
  }

  const rows = await db.query<{ id: string; level: string }>(
    "SELECT id, level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id IN (?, ?)",
    [userId, workspaceName, runId, specId ?? runId]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  const run = byId.get(runId);
  if (!run) return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${runId}` };
  if (run.level !== "workstream") {
    return { ok: false, errorCode: "NOT_A_RUN", message: `RUN(workstream)이 아닙니다: ${runId}(level=${run.level})` };
  }

  if (specId !== null) {
    const spec = byId.get(specId);
    if (!spec) return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${specId}` };
    if (spec.level !== "spec") {
      return { ok: false, errorCode: "NOT_A_SPEC", message: `Spec이 아닙니다: ${specId}(level=${spec.level})` };
    }
  }

  await db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    specId,
    userId,
    workspaceName,
    runId,
  ]);
  return { ok: true };
}

/**
 * `nextGroupId` — `run-NNN`(3자리 pad) 생성기. **파서는 `run-` 단일형만 인식한다**(`wst-`는
 * 이전 접두어라 인식하지 않는다 — 둘 다 인식하면 번호 공간이 갈라진다).
 * 999를 넘으면 pad 없이 이어간다(자릿수를 잘라 충돌시키지 않는다).
 */
export async function nextGroupId(db: DbClient, userId: string, workspaceName: string): Promise<string> {
  const rows = await db.query<{ id: string }>(
    "SELECT id FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND level = 'workstream'",
    [userId, workspaceName]
  );
  let max = 0;
  for (const r of rows) {
    const m = /^run-(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `run-${String(max + 1).padStart(3, "0")}`;
}

/**
 * `wst-` → `run-` 접두어 변환. **참조 3곳(id·parent·depends_on)을 전부** 옮긴다 —
 * 하나라도 빠지면 dangling 참조가 되어 그래프가 조용히 끊긴다.
 * 두 접두어가 같은 길이(4자)라 depends_on JSON은 문자열 치환으로도 유효성이 유지된다.
 *
 * 부팅 시 1회. 절대 던지지 않는다 — 마이그레이션 실패가 대시보드 기동을 막으면 안 된다.
 */
export async function migrateWstToRun(db: DbClient): Promise<{ migrated: number }> {
  try {
    const affected = await db.query<{ user_id: string; workspace_name: string; id: string; parent: string | null; depends_on: unknown }>(
      "SELECT user_id, workspace_name, id, parent, depends_on FROM sugo_roadmap_nodes WHERE id LIKE 'wst-%' OR parent LIKE 'wst-%' OR CAST(depends_on AS CHAR) LIKE '%wst-%'"
    );
    if (affected.length === 0) return { migrated: 0 };

    // **문자열 조작은 애플리케이션에서 한다.** SQL로 하면 MySQL(`CONCAT`/`SUBSTRING`)과
    // SQLite(`||`/`SUBSTR`) 문법이 갈라지므로 드라이버 중립으로 짠다.
    const rename = (v: string) => (v.startsWith("wst-") ? `run-${v.slice(4)}` : v);
    let migrated = 0;

    for (const row of affected) {
      // NULL은 NULL로 둔다. `[]`로 바꿔버리면 "순서를 아직 시딩 안 했다"(NULL)와 "비어 있도록
      // 편집했다"(`[]`)의 구분이 사라진다.
      const newDeps =
        row.depends_on === null || row.depends_on === undefined
          ? null
          : JSON.stringify(parseJsonArray(row.depends_on).map(rename));
      const newParent = row.parent === null ? null : rename(row.parent);
      const newId = rename(row.id);

      await db.exec(
        "UPDATE sugo_roadmap_nodes SET id = ?, parent = ?, depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
        [newId, newParent, newDeps, row.user_id, row.workspace_name, row.id]
      );
      if (newId !== row.id) migrated++;
    }
    return { migrated };
  } catch {
    return { migrated: 0 };
  }
}
