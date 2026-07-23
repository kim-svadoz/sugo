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
