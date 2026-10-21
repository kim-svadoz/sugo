import { stripHumanCompletion } from "./humanCompletion.js";
import type { DbClient } from "../db/client.js";
import { upsertRow } from "../db/upsert.js";
import { cleanDanglingDeps, computeNodesToDelete, shouldSeedDependsOn } from "./roadmapDiff.js";
import { parseJsonArray } from "../db/jsonColumn.js";
import { toDbDateTime } from "../db/datetime.js";
import { migrateRoadmapRuntimeAssessment } from "../db/migrations.js";

export async function ensureUser(db: DbClient, userId: string): Promise<void> {
  await upsertRow(db, "sugo_users", { id: userId }, {});
}

export interface SyncUserInput {
  userId: string;
  displayName?: string;
}

export async function syncUser(db: DbClient, input: SyncUserInput): Promise<void> {
  await upsertRow(
    db,
    "sugo_users",
    { id: input.userId },
    input.displayName !== undefined ? { display_name: input.displayName } : {}
  );
}

export interface SyncWorkspaceInput {
  userId: string;
  name: string;
  projects?: string[];
  gitSyncedProjects?: string[];
}

/**
 * `deleted_at` 자가보강. 캐시된 삼상태 boolean —
 * information_schema(또는 SQLite의 PRAGMA)로 컬럼을 확인하고 없으면 ALTER,
 * **ALTER 권한이 없으면 false로 확정하고 이후 필터를 생략한다(graceful degrade).**
 *
 * 왜 이렇게까지 하나: 코드가 마이그레이션보다 먼저 배포될 수 있다. 그때
 * `WHERE deleted_at IS NULL`이 들어 있으면 **대시보드 전체가 500으로 죽는다.** 숨김이 잠깐 안
 * 되는 건 불편이지만, 죽는 건 사고다 — 그래서 안전측 기본값이 "필터 생략(전부 노출)"이다.
 *
 * 캐시하는 이유: 이 판정이 모든 목록 조회 경로에 걸리는데, 매번 스키마를 조회하면 그게 곧 부하다.
 */
let deletedAtColState: boolean | null = null;

/** 테스트 전용 — 모듈 레벨 캐시를 비운다(프로세스 내 여러 DB를 오가는 테스트 때문). */
export function __resetDeletedAtColState(): void {
  deletedAtColState = null;
}

export async function ensureWorkspaceDeletedAtColumn(db: DbClient): Promise<boolean> {
  if (deletedAtColState !== null) return deletedAtColState;
  try {
    // 드라이버 중립: 실제로 읽어보고 통하면 있는 것으로 본다(MySQL의 information_schema와
    // SQLite의 PRAGMA를 분기하지 않아도 되고, 권한 문제도 같은 방식으로 흡수된다).
    await db.query("SELECT deleted_at FROM sugo_workspaces LIMIT 1");
    deletedAtColState = true;
    return true;
  } catch {
    // 없다 → 추가를 시도한다.
  }
  try {
    await db.exec("ALTER TABLE sugo_workspaces ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL");
    deletedAtColState = true;
    return true;
  } catch {
    deletedAtColState = false;
    return false;
  }
}

/** `sugo_roadmap_nodes.due_date` 자가보강 — 위 `ensureWorkspaceDeletedAtColumn`과 같은 패턴. */
let dueDateColState: boolean | null = null;

/** 테스트 전용 — 모듈 레벨 캐시를 비운다. */
export function __resetDueDateColState(): void {
  dueDateColState = null;
}

export async function ensureRoadmapDueDateColumn(db: DbClient): Promise<boolean> {
  if (dueDateColState !== null) return dueDateColState;
  try {
    await db.query("SELECT due_date FROM sugo_roadmap_nodes LIMIT 1");
    dueDateColState = true;
    return true;
  } catch {
    // 없다 → 추가를 시도한다.
  }
  try {
    await db.exec("ALTER TABLE sugo_roadmap_nodes ADD COLUMN due_date DATE NULL");
    dueDateColState = true;
    return true;
  } catch {
    dueDateColState = false;
    return false;
  }
}

/**
 * `sugo_roadmap_nodes.project_path` 자가보강 — 위와 같은 패턴. 이 컬럼은 대시보드가
 * 직접 채우는 값이라 `syncRoadmap`의 UPDATE SET 절에는 절대 넣지 않는다 — CLI 재동기화가
 * 대시보드에서 지정한 프로젝트를 덮어쓰면 안 되기 때문이다.
 */
let projectPathColState: boolean | null = null;

/** 테스트 전용 — 모듈 레벨 캐시를 비운다. */
export function __resetProjectPathColState(): void {
  projectPathColState = null;
}

export async function ensureRoadmapProjectPathColumn(db: DbClient): Promise<boolean> {
  if (projectPathColState !== null) return projectPathColState;
  try {
    await db.query("SELECT project_path FROM sugo_roadmap_nodes LIMIT 1");
    projectPathColState = true;
    return true;
  } catch {
    // 없다 → 추가를 시도한다.
  }
  try {
    await db.exec("ALTER TABLE sugo_roadmap_nodes ADD COLUMN project_path TEXT NULL");
    projectPathColState = true;
    return true;
  } catch {
    projectPathColState = false;
    return false;
  }
}

let workBranchColState: boolean | null = null;
export function __resetWorkBranchColState(): void { workBranchColState = null; }
export async function ensureRoadmapWorkBranchColumn(db: DbClient): Promise<boolean> {
  if (workBranchColState !== null) return workBranchColState;
  try {
    await db.query("SELECT work_branch FROM sugo_roadmap_nodes LIMIT 1");
    workBranchColState = true;
    return true;
  } catch { /* add below */ }
  try {
    await db.exec("ALTER TABLE sugo_roadmap_nodes ADD COLUMN work_branch VARCHAR(255) NULL");
    workBranchColState = true;
    return true;
  } catch {
    workBranchColState = false;
    return false;
  }
}

/**
 * `sugo_roadmap_nodes.manual_title` 자가보강 — 위와 같은 패턴. Canvas의 이름 변경(✎)이
 * 쓰는 값이라 `syncRoadmap`의 UPDATE SET 절에는 넣지 않는다 — CLI가 다시 push하는 원래
 * 제목이 대시보드에서 바꾼 이름을 덮어쓰면 안 되기 때문이다(manual_status와 같은 오버레이
 * 패턴: 원래 `title`은 CLI 진실을 계속 유지하고, 표시는 `manual_title ?? title`로 판정).
 */
let manualTitleColState: boolean | null = null;

/** 테스트 전용 — 모듈 레벨 캐시를 비운다. */
export function __resetManualTitleColState(): void {
  manualTitleColState = null;
}

export async function ensureRoadmapManualTitleColumn(db: DbClient): Promise<boolean> {
  if (manualTitleColState !== null) return manualTitleColState;
  try {
    await db.query("SELECT manual_title FROM sugo_roadmap_nodes LIMIT 1");
    manualTitleColState = true;
    return true;
  } catch {
    // 없다 → 추가를 시도한다.
  }
  try {
    await db.exec("ALTER TABLE sugo_roadmap_nodes ADD COLUMN manual_title TEXT NULL");
    manualTitleColState = true;
    return true;
  } catch {
    manualTitleColState = false;
    return false;
  }
}

let blockerDecisionColsState: boolean | null = null;

export function __resetBlockerDecisionColsState(): void {
  blockerDecisionColsState = null;
}

/** 사람의 차단 해소 결정은 대시보드 소유 오버레이다. 플러그인 재동기화가 지우지 않는다. */
export async function ensureRoadmapBlockerDecisionColumns(db: DbClient): Promise<boolean> {
  if (blockerDecisionColsState !== null) return blockerDecisionColsState;
  const columns = [
    ["blocker_response", "TEXT NULL"],
    ["blocker_answered_by", "VARCHAR(191) NULL"],
    ["blocker_answered_at", "TIMESTAMP NULL"],
    ["blocker_context", "TEXT NULL"],
  ] as const;
  try {
    for (const [name, definition] of columns) {
      try {
        await db.query(`SELECT ${name} FROM sugo_roadmap_nodes LIMIT 1`);
      } catch {
        await db.exec(`ALTER TABLE sugo_roadmap_nodes ADD COLUMN ${name} ${definition}`);
      }
    }
    blockerDecisionColsState = true;
  } catch {
    blockerDecisionColsState = false;
  }
  return blockerDecisionColsState;
}

let runtimeAssessmentColState: boolean | null = null;

export function __resetRuntimeAssessmentColState(): void {
  runtimeAssessmentColState = null;
}

/** 플러그인 Ontology projection snapshot. 구 DB에서는 additive TEXT/JSON 컬럼으로 자가보강한다. */
export async function ensureRoadmapRuntimeAssessmentColumn(db: DbClient): Promise<boolean> {
  if (runtimeAssessmentColState !== null) return runtimeAssessmentColState;
  runtimeAssessmentColState = await migrateRoadmapRuntimeAssessment(db);
  return runtimeAssessmentColState;
}

/**
 * `sugo_checkpoints.created_at` 자가보강 — 같은 패턴. 체크포인트 목록을 페이지네이션할 때
 * "처음 만든 순"으로 정렬할 기준이 필요해서 추가했다. CLI 재동기화(`syncCheckpoint`)는
 * `upsertRow`로 UPDATE 시 이 컬럼을 SET에 넣지 않으므로 최초 생성 시각이 그대로 유지된다.
 */
let checkpointCreatedAtColState: boolean | null = null;

/** 테스트 전용 — 모듈 레벨 캐시를 비운다. */
export function __resetCheckpointCreatedAtColState(): void {
  checkpointCreatedAtColState = null;
}

export async function ensureCheckpointCreatedAtColumn(db: DbClient): Promise<boolean> {
  if (checkpointCreatedAtColState !== null) return checkpointCreatedAtColState;
  try {
    await db.query("SELECT created_at FROM sugo_checkpoints LIMIT 1");
    checkpointCreatedAtColState = true;
    return true;
  } catch {
    // 없다 → 추가를 시도한다.
  }
  try {
    // node:sqlite(와 대부분의 SQLite 빌드)는 ALTER TABLE ADD COLUMN에 CURRENT_TIMESTAMP 같은
    // "비상수" DEFAULT를 거부한다("Cannot add a column with non-constant default").
    // 그래서 다른 자가보강 컬럼들과 같은 패턴으로 NULL 허용 + 기본값 없이 추가하고,
    // 이미 있는 행은 즉시 한 번 백필한다. CREATE TABLE의 DEFAULT CURRENT_TIMESTAMP는
    // 이 제약이 없어 그대로 둔다. 제약은 ALTER 경로에서만 생긴다.
    await db.exec("ALTER TABLE sugo_checkpoints ADD COLUMN created_at TIMESTAMP NULL");
    await db.exec("UPDATE sugo_checkpoints SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
    checkpointCreatedAtColState = true;
    return true;
  } catch {
    checkpointCreatedAtColState = false;
    return false;
  }
}

let checkpointExpiresAtColState: boolean | null = null;

export function __resetCheckpointExpiresAtColState(): void {
  checkpointExpiresAtColState = null;
}

/** 기존 로컬 DB에도 체크포인트 유효일을 안전하게 추가한다. DATE/TEXT 모두 문자열 비교가 가능하다. */
export async function ensureCheckpointExpiresAtColumn(db: DbClient): Promise<boolean> {
  if (checkpointExpiresAtColState !== null) return checkpointExpiresAtColState;
  try {
    await db.query("SELECT expires_at FROM sugo_checkpoints LIMIT 1");
    checkpointExpiresAtColState = true;
    return true;
  } catch {
    // 없다 → nullable DATE 컬럼 추가. 기본값이 없어 SQLite ALTER에도 안전하다.
  }
  try {
    await db.exec("ALTER TABLE sugo_checkpoints ADD COLUMN expires_at DATE NULL");
    checkpointExpiresAtColState = true;
    return true;
  } catch {
    checkpointExpiresAtColState = false;
    return false;
  }
}

async function getOrCreateWorkspaceId(db: DbClient, userId: string, name: string): Promise<number> {
  const rows = await db.query<{ id: number }>(
    "SELECT id FROM sugo_workspaces WHERE user_id = ? AND name = ?",
    [userId, name]
  );
  if (rows.length > 0) {
    // "soft delete 부활": 재sync는 곧 "이 워크스페이스를 다시 쓰고 있다"는 신호다.
    // 컬럼이 있을 때만 시도한다(없으면 애초에 soft delete도 안 걸려 있다).
    if (await ensureWorkspaceDeletedAtColumn(db)) {
      await db.exec("UPDATE sugo_workspaces SET deleted_at = NULL WHERE id = ?", [rows[0].id]);
    }
    return rows[0].id;
  }
  const result = await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES (?, ?)", [userId, name]);
  return Number(result.insertId);
}

// workspace: replaces the project list and records gitSyncedProjects.
export async function syncWorkspace(db: DbClient, input: SyncWorkspaceInput): Promise<void> {
  await ensureUser(db, input.userId);
  // 자가보강은 **진입 시점**에 한다. getOrCreateWorkspaceId의 UPDATE 분기에만 두면 신규
  // 워크스페이스를 만드는 경로에서는 컬럼이 안 생기고, 그 뒤 첫 soft delete가 올 때까지
  // 스키마가 비어 있는 상태가 유지된다.
  await ensureWorkspaceDeletedAtColumn(db);
  const workspaceId = await getOrCreateWorkspaceId(db, input.userId, input.name);

  const projects = input.projects ?? [];
  const gitSynced = new Set(input.gitSyncedProjects ?? []);

  const existing = await db.query<{ id: number; project_path: string }>(
    "SELECT id, project_path FROM sugo_workspace_projects WHERE workspace_id = ?",
    [workspaceId]
  );
  const existingByPath = new Map(existing.map((p) => [p.project_path, p.id]));
  const incoming = new Set(projects);

  for (const p of existing) {
    if (!incoming.has(p.project_path)) {
      await db.exec("DELETE FROM sugo_workspace_projects WHERE id = ?", [p.id]);
    }
  }

  for (const path of projects) {
    const flag = gitSynced.has(path) ? 1 : 0;
    const existingId = existingByPath.get(path);
    if (existingId !== undefined) {
      await db.exec("UPDATE sugo_workspace_projects SET git_synced = ? WHERE id = ?", [flag, existingId]);
    } else {
      await db.exec(
        "INSERT INTO sugo_workspace_projects (workspace_id, project_path, git_synced) VALUES (?, ?, ?)",
        [workspaceId, path, flag]
      );
    }
  }
}

/**
 * `DELETE /api/sync/workspace` — **기본은 soft, `purge:true`여야 하드.**
 *
 * 플러그인이 기본 soft로 보내고 사용자에게 "복구 가능하다"고 안내한다. 여기서 하드로 지우면
 * 그 안내가 거짓말이 된다 — 삭제 의미는 양쪽이 같아야 한다.
 *
 * 컬럼이 없어 soft가 불가능하면 **아무 것도 하지 않는다.** 여기서 하드로 폴백하면
 * "숨기려 했는데 지워졌다"가 되어 조용한 데이터 소멸이 된다.
 */
export async function deleteWorkspace(
  db: DbClient,
  userId: string,
  name: string,
  options: { purge?: boolean } = {},
): Promise<void> {
  if (options.purge) {
    // 관련 테이블은 FK CASCADE가 없는 것들(복합PK 테이블)이라 명시적으로 지운다.
    for (const table of ["sugo_tasks", "sugo_history", "sugo_specs", "sugo_checkpoints", "sugo_workspace_meta", "sugo_roadmap_nodes"]) {
      try {
        await db.exec(`DELETE FROM ${table} WHERE user_id = ? AND workspace_name = ?`, [userId, name]);
      } catch {
        // 지연생성 테이블이 아직 없을 수 있다 — purge 전체를 실패시키지 않는다.
      }
    }
    await db.exec("DELETE FROM sugo_workspaces WHERE user_id = ? AND name = ?", [userId, name]);
    return;
  }

  const hasCol = await ensureWorkspaceDeletedAtColumn(db);
  if (!hasCol) return;
  await db.exec("UPDATE sugo_workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND name = ? AND deleted_at IS NULL", [
    userId,
    name,
  ]);
}

export interface SyncTaskInput {
  userId: string;
  workspaceName: string;
  id: string;
  title: string;
  project?: string | null;
  status?: string;
  priority?: string | null;
  description?: string | null;
  summary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export async function syncTask(db: DbClient, input: SyncTaskInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_tasks",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      title: input.title,
      project: input.project ?? null,
      status: input.status ?? "pending",
      priority: input.priority ?? null,
      description: input.description ?? null,
      summary: input.summary ?? null,
      started_at: toDbDateTime(input.startedAt),
      completed_at: toDbDateTime(input.completedAt),
    }
  );
}

export async function deleteTask(db: DbClient, userId: string, workspaceName: string, id: string): Promise<void> {
  await db.exec("DELETE FROM sugo_tasks WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

export interface SyncHistoryInput {
  userId: string;
  workspaceName: string;
  id: string;
  taskId?: string | null;
  taskTitle?: string | null;
  summary?: string | null;
  keyDecisions?: unknown;
  filesChanged?: unknown;
  notes?: string | null;
  completedAt?: string | null;
  estimatedHumanHours?: number | null;
  userReportedHumanHours?: number | null;
  aiExecutionMinutes?: number | null;
  estimationBasis?: string | null;
}

export async function syncHistory(db: DbClient, input: SyncHistoryInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_history",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      task_id: input.taskId ?? null,
      task_title: input.taskTitle ?? null,
      summary: input.summary ?? null,
      key_decisions: input.keyDecisions !== undefined ? JSON.stringify(input.keyDecisions) : null,
      files_changed: input.filesChanged !== undefined ? JSON.stringify(input.filesChanged) : null,
      notes: input.notes ?? null,
      completed_at: toDbDateTime(input.completedAt),
      estimated_human_hours: input.estimatedHumanHours ?? null,
      user_reported_human_hours: input.userReportedHumanHours ?? null,
      ai_execution_minutes: input.aiExecutionMinutes ?? null,
      estimation_basis: input.estimationBasis ?? null,
    }
  );
}

export async function deleteHistory(db: DbClient, userId: string, workspaceName: string, id: string): Promise<void> {
  await db.exec("DELETE FROM sugo_history WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

export interface SyncSpecInput {
  userId: string;
  workspaceName: string;
  id: string;
  title: string;
  status?: string;
  content?: string | null;
  decisionDate?: string | null;
}

export async function syncSpec(db: DbClient, input: SyncSpecInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_specs",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      title: input.title,
      status: input.status ?? "active",
      content: input.content ?? null,
      decision_date: toDbDateTime(input.decisionDate),
    }
  );
}

export async function deleteSpec(db: DbClient, userId: string, workspaceName: string, id: string): Promise<void> {
  await db.exec("DELETE FROM sugo_specs WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

export interface SyncCheckpointInput {
  userId: string;
  workspaceName: string;
  id: string;
  category?: string;
  title: string;
  learnedFrom?: string | null;
  checklist?: unknown;
  appliesTo?: unknown;
  checkpointDate?: string | null;
  expiresAt?: string | null;
}

export async function syncCheckpoint(db: DbClient, input: SyncCheckpointInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_checkpoints",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      category: input.category ?? "general",
      title: input.title,
      learned_from: input.learnedFrom ?? null,
      checklist: input.checklist !== undefined ? JSON.stringify(input.checklist) : null,
      applies_to: input.appliesTo !== undefined ? JSON.stringify(input.appliesTo) : null,
      checkpoint_date: toDbDateTime(input.checkpointDate),
      expires_at: input.expiresAt ?? null,
    }
  );
}

export async function deleteCheckpoint(
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

export interface SyncWorkspaceMetaInput {
  userId: string;
  workspaceName: string;
  goldenRule?: string | null;
  checkpointsVersion?: number;
}

export async function syncWorkspaceMeta(db: DbClient, input: SyncWorkspaceMetaInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_workspace_meta",
    { user_id: input.userId, workspace_name: input.workspaceName },
    {
      golden_rule: input.goldenRule ?? null,
      checkpoints_version: input.checkpointsVersion ?? 0,
    }
  );
}

export async function syncPluginVersion(db: DbClient, userId: string, version: string): Promise<void> {
  await ensureUser(db, userId);
  await db.exec(
    "UPDATE sugo_users SET plugin_version = ?, version_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [version, userId]
  );
}

export async function getPluginVersion(db: DbClient, userId: string): Promise<string | null> {
  const rows = await db.query<{ plugin_version: string | null }>(
    "SELECT plugin_version FROM sugo_users WHERE id = ?",
    [userId]
  );
  return rows[0]?.plugin_version ?? null;
}

export interface RoadmapNodeInput {
  id: string;
  title: string;
  level: string;
  status: string;
  dependsOn?: string[];
  parent?: string | null;
  ref?: string | null;
  note?: string | null;
  specPath?: string | null;
  workResult?: unknown;
  lineage?: unknown;
  humanBlocker?: unknown;
  runtimeAssessment?: unknown;
}

interface RoadmapRow {
  id: string;
  level: string;
  // driver-dependent: mysql2 auto-parses JSON columns to arrays, node:sqlite
  // returns the raw TEXT string - parseJsonArray() normalizes both.
  depends_on: unknown;
}

// roadmap sync: 스냅샷 replace 시맨틱 + 소유권 경계(depends_on 최초1회 seed,
// manual_status/manual_by/manual_at/pos_x/pos_y/due_date/project_path/manual_title은
// upsert SET에서 물리적으로 제외).
export async function syncRoadmap(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodes: RoadmapNodeInput[]
): Promise<void> {
  await ensureUser(db, userId);
  const hasRuntimeAssessment = await ensureRoadmapRuntimeAssessmentColumn(db);

  const existingRows = await db.query<RoadmapRow>(
    "SELECT id, level, depends_on FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName]
  );
  const existingById = new Map(existingRows.map((r) => [r.id, r]));
  const incomingIds = new Set(nodes.map((n) => n.id));

  const toDelete = computeNodesToDelete(
    existingRows.map((r) => ({ id: r.id, level: r.level, dependsOn: parseJsonArray(r.depends_on) })),
    incomingIds
  );
  for (const id of toDelete) {
    await db.exec("DELETE FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?", [
      userId,
      workspaceName,
      id,
    ]);
  }
  const deletedIds = new Set(toDelete);

  for (const node of nodes) {
    const existing = existingById.get(node.id);
    const existingDeps = existing ? parseJsonArray(existing.depends_on) : undefined;
    const seed = shouldSeedDependsOn(existingDeps);
    const incomingDeps = cleanDanglingDeps(node.dependsOn ?? [], deletedIds);

    const workResultJson = node.workResult !== undefined ? JSON.stringify(stripHumanCompletion(node.workResult)) : undefined;
    const lineageJson = node.lineage !== undefined ? JSON.stringify(stripHumanCompletion(node.lineage)) : undefined;
    const blockerContextJson = node.humanBlocker !== undefined ? JSON.stringify(node.humanBlocker) : null;
    const runtimeAssessmentJson = node.runtimeAssessment !== undefined ? JSON.stringify(node.runtimeAssessment) : null;

    if (!existing) {
      await db.exec(
        `INSERT INTO sugo_roadmap_nodes
         (id, user_id, workspace_name, title, level, status, depends_on, parent, ref, note, spec_path, work_result, lineage, blocker_context${hasRuntimeAssessment ? ", runtime_assessment" : ""}, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${hasRuntimeAssessment ? ", ?" : ""}, CURRENT_TIMESTAMP)`,
        [
          node.id,
          userId,
          workspaceName,
          node.title,
          node.level,
          node.status,
          JSON.stringify(incomingDeps),
          node.parent ?? null,
          node.ref ?? null,
          node.note ?? null,
          node.specPath ?? null,
          workResultJson ?? null,
          lineageJson ?? null,
          blockerContextJson,
          ...(hasRuntimeAssessment ? [runtimeAssessmentJson] : []),
        ]
      );
      continue;
    }

    const sets = ["title = ?", "level = ?", "status = ?", "parent = ?", "ref = ?", "note = ?", "spec_path = ?", "blocker_context = ?", "synced_at = CURRENT_TIMESTAMP"];
    const params: unknown[] = [node.title, node.level, node.status, node.parent ?? null, node.ref ?? null, node.note ?? null, node.specPath ?? null, blockerContextJson];
    // 플러그인이 사람의 결정을 소비해 차단을 해제한 순간, Dashboard의 입력값도 소비한다.
    // blocked 상태의 재동기화는 폴링일 수 있으므로 그때는 사용자가 저장한 결정을 보존한다.
    if (node.humanBlocker === undefined && node.status !== "blocked") {
      sets.push("blocker_response = NULL", "blocker_answered_by = NULL", "blocker_answered_at = NULL");
    }
    // 구버전 플러그인은 필드를 보내지 않는다. 이때 마지막으로 저장된 신형 projection을
    // null로 지우지 않아야 롤링 업데이트 중에도 Dashboard 판정이 흔들리지 않는다.
    if (hasRuntimeAssessment && node.runtimeAssessment !== undefined) {
      sets.splice(sets.length - 1, 0, "runtime_assessment = ?");
      params.push(runtimeAssessmentJson);
    }
    if (workResultJson !== undefined) {
      sets.push("work_result = ?");
      params.push(workResultJson);
    }
    if (lineageJson !== undefined) {
      sets.push("lineage = ?");
      params.push(lineageJson);
    }
    if (seed) {
      sets.push("depends_on = ?");
      params.push(JSON.stringify(incomingDeps));
    }
    params.push(userId, workspaceName, node.id);
    await db.exec(
      `UPDATE sugo_roadmap_nodes SET ${sets.join(", ")} WHERE user_id = ? AND workspace_name = ? AND id = ?`,
      params
    );
  }

  // Sweep every remaining node for dangling refs to a deleted id - not just
  // the ones untouched this round. A node whose depends_on is dashboard-owned
  // (seed=false in the loop above) never had its incoming value applied, so
  // its stored depends_on can still point at an id we just deleted; this is
  // invalid data regardless of ownership, so cleanup runs unconditionally.
  if (deletedIds.size > 0) {
    const remaining = await db.query<RoadmapRow>(
      "SELECT id, level, depends_on FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
      [userId, workspaceName]
    );
    for (const row of remaining) {
      const deps = parseJsonArray(row.depends_on);
      const cleaned = cleanDanglingDeps(deps, deletedIds);
      if (cleaned.length !== deps.length) {
        await db.exec(
          "UPDATE sugo_roadmap_nodes SET depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
          [JSON.stringify(cleaned), userId, workspaceName, row.id]
        );
      }
    }
  }
}
