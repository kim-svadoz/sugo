-- SQLite translation of src/db/schema.mysql.sql, used only for local dev/testing
-- until a real MySQL instance is available (see docs/roadmap-progress.md).
-- Must stay behaviorally equivalent: same tables/columns/keys, syntax adapted
-- (ENUM->TEXT+CHECK, JSON->TEXT, AUTO_INCREMENT->INTEGER PRIMARY KEY AUTOINCREMENT,
-- TIMESTAMP->TEXT ISO8601, composite PKs as-is since SQLite supports them).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sugo_users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  plugin_version TEXT,
  version_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sugo_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES sugo_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS sugo_workspace_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES sugo_workspaces(id) ON DELETE CASCADE,
  project_path TEXT NOT NULL,
  git_synced INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, project_path)
);

CREATE TABLE IF NOT EXISTS sugo_tasks (
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  project TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','archived')),
  priority TEXT,
  description TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, workspace_name, id)
);

CREATE TABLE IF NOT EXISTS sugo_history (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  task_id TEXT,
  task_title TEXT,
  summary TEXT,
  key_decisions TEXT,
  files_changed TEXT,
  notes TEXT,
  estimated_human_hours REAL,
  user_reported_human_hours REAL,
  ai_execution_minutes REAL,
  estimation_basis TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, workspace_name, id)
);

CREATE TABLE IF NOT EXISTS sugo_schedule_memos (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES sugo_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_memos_due ON sugo_schedule_memos(user_id, due_date);

CREATE TABLE IF NOT EXISTS sugo_schedule_commitments (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES sugo_users(id) ON DELETE CASCADE,
  workspace_name TEXT NOT NULL,
  spec_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  state TEXT NOT NULL DEFAULT 'planned' CHECK (state IN ('planned','active','completed','cancelled')),
  target TEXT NOT NULL DEFAULT 'custom' CHECK (target IN ('implementation','review','dev','stg','prd','custom')),
  linked_run_id TEXT,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_commitments_due ON sugo_schedule_commitments(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_schedule_commitments_spec ON sugo_schedule_commitments(user_id, workspace_name, spec_id);

CREATE TABLE IF NOT EXISTS sugo_schedule_spec_archives (
  user_id TEXT NOT NULL REFERENCES sugo_users(id) ON DELETE CASCADE,
  workspace_name TEXT NOT NULL,
  spec_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('deleted','closed')),
  title TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_by TEXT NOT NULL,
  PRIMARY KEY (user_id, workspace_name, spec_id)
);

CREATE TABLE IF NOT EXISTS sugo_decisions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  content TEXT,
  decision_date TEXT,
  PRIMARY KEY (user_id, workspace_name, id)
);

CREATE TABLE IF NOT EXISTS sugo_checkpoints (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  learned_from TEXT,
  checklist TEXT,
  applies_to TEXT,
  checkpoint_date TEXT,
  expires_at TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, workspace_name, id)
);

CREATE TABLE IF NOT EXISTS sugo_workspace_meta (
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  golden_rule TEXT,
  checkpoints_version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workspace_name)
);

CREATE TABLE IF NOT EXISTS sugo_roadmap_nodes (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('spec','workstream','task','subtask','step')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked','dropped')),
  depends_on TEXT,
  parent TEXT,
  ref TEXT,
  note TEXT,
  spec_path TEXT,
  work_result TEXT,
  lineage TEXT,
  manual_status TEXT CHECK (manual_status IS NULL OR manual_status IN ('pending','in_progress','done','blocked','dropped')),
  manual_by TEXT,
  manual_at TEXT,
  pos_x REAL,
  pos_y REAL,
  due_date TEXT,
  project_path TEXT,
  work_branch TEXT,
  manual_title TEXT,
  blocker_response TEXT,
  blocker_answered_by TEXT,
  blocker_answered_at TEXT,
  blocker_context TEXT,
  runtime_assessment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT,
  PRIMARY KEY (user_id, workspace_name, id)
);

CREATE TABLE IF NOT EXISTS sugo_activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  ts TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'INFO' CHECK (level IN ('AGENT','INFO','WARN','ERROR','SYSTEM')),
  agent TEXT CHECK (agent IS NULL OR agent IN ('MAIN','CODE','TEST','REVIEW','DOCS')),
  handoff_to TEXT CHECK (handoff_to IS NULL OR handoff_to IN ('MAIN','CODE','TEST','REVIEW','DOCS')),
  event_type TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (event_type IN ('EXECUTE','HANDOFF','COMPLETED','SYSTEM')),
  message TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_user_ws_ts ON sugo_activity_events (user_id, workspace_name, ts);

CREATE TABLE IF NOT EXISTS user_bitbucket_tokens (
  user_id TEXT PRIMARY KEY,
  ct TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  base_url TEXT,
  token_hint TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_git_connections (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github','gitlab','bitbucket_server','aws_codecommit')),
  ct TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  base_url TEXT,
  credential_profile TEXT,
  token_hint TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS user_aws_context_accounts (
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile TEXT NOT NULL,
  region TEXT NOT NULL,
  account_id TEXT NOT NULL,
  principal_arn TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);

CREATE TABLE IF NOT EXISTS user_aws_context_snapshots (
  user_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, account_name)
);

CREATE TABLE IF NOT EXISTS user_aws_context_preferences (
  user_id TEXT NOT NULL PRIMARY KEY,
  active_account_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_aws_context_refresh_budget (
  user_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  day_key TEXT NOT NULL,
  day_count INTEGER NOT NULL,
  last_started_at TEXT NOT NULL,
  PRIMARY KEY (user_id, account_name)
);

CREATE TABLE IF NOT EXISTS user_project_integration_mappings (
  user_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  selections TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_path)
);

CREATE TABLE IF NOT EXISTS user_pinpoint_context (user_id TEXT PRIMARY KEY, base_url TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_pinpoint_snapshots (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL, observed_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS user_api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS sugo_review_artifacts (
  artifact_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_name TEXT NOT NULL,
  task_id TEXT NOT NULL, session_id TEXT NOT NULL, patch_version INTEGER NOT NULL,
  file_path TEXT NOT NULL, change_type TEXT NOT NULL, content TEXT, diff_text TEXT,
  unavailable_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sugo_weekly_reports (
  user_id TEXT NOT NULL,
  week_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  report_json TEXT NOT NULL,
  PRIMARY KEY (user_id, week_id)
);
