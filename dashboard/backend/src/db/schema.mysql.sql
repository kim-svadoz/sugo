-- Sugo Console schema (MySQL, production target).
-- Tables that could be created lazily at runtime (activity_events, bitbucket_tokens)
-- are declared up front here.

CREATE TABLE IF NOT EXISTS sugo_users (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  display_name VARCHAR(255) NULL,
  plugin_version VARCHAR(64) NULL,
  version_updated_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_workspaces (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_user_name (user_id, name),
  CONSTRAINT fk_workspaces_user FOREIGN KEY (user_id) REFERENCES sugo_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_workspace_projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  project_path VARCHAR(1024) NOT NULL,
  git_synced TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_workspace_path (workspace_id, project_path(255)),
  CONSTRAINT fk_projects_workspace FOREIGN KEY (workspace_id) REFERENCES sugo_workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_tasks (
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  id VARCHAR(191) NOT NULL,
  title VARCHAR(512) NOT NULL,
  project VARCHAR(512) NULL,
  status ENUM('pending','in_progress','done','archived') NOT NULL DEFAULT 'pending',
  priority VARCHAR(32) NULL,
  description MEDIUMTEXT NULL,
  summary MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, workspace_name, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_history (
  id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  task_id VARCHAR(191) NULL,
  task_title VARCHAR(512) NULL,
  summary MEDIUMTEXT NULL,
  key_decisions JSON NULL,
  files_changed JSON NULL,
  notes MEDIUMTEXT NULL,
  estimated_human_hours DECIMAL(6,2) NULL,
  user_reported_human_hours DECIMAL(6,2) NULL,
  ai_execution_minutes DECIMAL(8,2) NULL,
  estimation_basis VARCHAR(64) NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, workspace_name, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_schedule_memos (
  id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  title VARCHAR(512) NOT NULL,
  content_md MEDIUMTEXT NOT NULL,
  due_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id),
  KEY idx_schedule_memos_due (user_id, due_date),
  CONSTRAINT fk_schedule_memos_user FOREIGN KEY (user_id) REFERENCES sugo_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_schedule_commitments (
  id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  spec_id VARCHAR(191) NOT NULL,
  title VARCHAR(512) NOT NULL,
  due_date DATE NULL,
  state ENUM('planned','active','completed','cancelled') NOT NULL DEFAULT 'planned',
  target ENUM('implementation','review','dev','stg','prd','custom') NOT NULL DEFAULT 'custom',
  linked_run_id VARCHAR(191) NULL,
  completed_at TIMESTAMP NULL,
  completed_by VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id),
  KEY idx_schedule_commitments_due (user_id, due_date),
  KEY idx_schedule_commitments_spec (user_id, workspace_name, spec_id),
  CONSTRAINT fk_schedule_commitments_user FOREIGN KEY (user_id) REFERENCES sugo_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_schedule_spec_archives (
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  spec_id VARCHAR(191) NOT NULL,
  reason ENUM('deleted','closed') NOT NULL,
  title VARCHAR(512) NOT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_by VARCHAR(191) NOT NULL,
  PRIMARY KEY (user_id, workspace_name, spec_id),
  KEY idx_schedule_spec_archives_time (user_id, archived_at),
  CONSTRAINT fk_schedule_spec_archives_user FOREIGN KEY (user_id) REFERENCES sugo_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_decisions (
  id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  title VARCHAR(512) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'accepted',
  content MEDIUMTEXT NULL,
  decision_date TIMESTAMP NULL,
  PRIMARY KEY (user_id, workspace_name, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_checkpoints (
  id VARCHAR(32) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  title VARCHAR(512) NOT NULL,
  learned_from TEXT NULL,
  checklist JSON NULL,
  applies_to JSON NULL,
  checkpoint_date TIMESTAMP NULL,
  expires_at DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, workspace_name, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_workspace_meta (
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  golden_rule MEDIUMTEXT NULL,
  checkpoints_version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workspace_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_roadmap_nodes (
  id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  title VARCHAR(512) NOT NULL,
  level ENUM('spec','workstream','task','subtask','step') NOT NULL,
  status ENUM('pending','in_progress','done','blocked','dropped') NOT NULL DEFAULT 'pending',
  depends_on JSON NULL,
  parent VARCHAR(191) NULL,
  ref VARCHAR(512) NULL,
  note MEDIUMTEXT NULL,
  spec_path VARCHAR(1024) NULL,
  work_result JSON NULL,
  lineage JSON NULL,
  manual_status ENUM('pending','in_progress','done','blocked','dropped') NULL,
  manual_by VARCHAR(191) NULL,
  manual_at TIMESTAMP NULL,
  pos_x DECIMAL(10,2) NULL,
  pos_y DECIMAL(10,2) NULL,
  due_date DATE NULL,
  project_path TEXT NULL,
  work_branch VARCHAR(255) NULL,
  manual_title VARCHAR(512) NULL,
  blocker_response MEDIUMTEXT NULL,
  blocker_answered_by VARCHAR(191) NULL,
  blocker_answered_at TIMESTAMP NULL,
  blocker_context JSON NULL,
  runtime_assessment JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  synced_at TIMESTAMP NULL,
  PRIMARY KEY (user_id, workspace_name, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_activity_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  ts DATETIME(3) NOT NULL,
  level ENUM('AGENT','INFO','WARN','ERROR','SYSTEM') NOT NULL DEFAULT 'INFO',
  agent ENUM('MAIN','CODE','TEST','REVIEW','DOCS') NULL,
  handoff_to ENUM('MAIN','CODE','TEST','REVIEW','DOCS') NULL,
  event_type ENUM('EXECUTE','HANDOFF','COMPLETED','SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  message MEDIUMTEXT NOT NULL,
  details JSON NULL,
  KEY idx_activity_user_ws_ts (user_id, workspace_name, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_bitbucket_tokens (
  user_id VARCHAR(191) NOT NULL PRIMARY KEY,
  ct TEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  base_url VARCHAR(1024) NULL,
  token_hint VARCHAR(8) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_git_connections (
  user_id VARCHAR(191) NOT NULL,
  provider ENUM('github','gitlab','bitbucket_server','aws_codecommit') NOT NULL,
  ct TEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  base_url VARCHAR(1024) NULL,
  credential_profile VARCHAR(191) NULL,
  token_hint VARCHAR(8) NULL,
  updated_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_aws_context_accounts (
  user_id VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  profile VARCHAR(191) NOT NULL,
  region VARCHAR(64) NOT NULL,
  account_id VARCHAR(32) NOT NULL,
  principal_arn VARCHAR(1024) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_aws_context_snapshots (
  user_id VARCHAR(191) NOT NULL,
  account_name VARCHAR(191) NOT NULL,
  payload JSON NOT NULL,
  observed_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, account_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_aws_context_preferences (
  user_id VARCHAR(191) NOT NULL PRIMARY KEY,
  active_account_name VARCHAR(191) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_aws_context_refresh_budget (
  user_id VARCHAR(191) NOT NULL,
  account_name VARCHAR(191) NOT NULL,
  day_key CHAR(10) NOT NULL,
  day_count INT NOT NULL,
  last_started_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, account_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_project_integration_mappings (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  project_path VARCHAR(1024) NOT NULL,
  selections JSON NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  UNIQUE KEY uq_user_project_integration (user_id, project_path(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_pinpoint_context (
  user_id VARCHAR(191) NOT NULL PRIMARY KEY,
  base_url VARCHAR(1024) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_pinpoint_snapshots (
  user_id VARCHAR(191) NOT NULL PRIMARY KEY,
  payload JSON NOT NULL,
  observed_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 플러그인이 sync 시 Bearer로 보내는 개인 API 토큰. 평문은 저장하지
-- 않고 sha256 해시만 저장한다(user_bitbucket_tokens와 달리 복호화 불필요 — 대조만 함).
CREATE TABLE IF NOT EXISTS user_api_tokens (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  name VARCHAR(191) NULL,
  token_hash CHAR(64) NOT NULL,
  token_hint VARCHAR(12) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  UNIQUE KEY uq_api_token_hash (token_hash),
  KEY idx_api_tokens_user (user_id),
  CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES sugo_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_review_artifacts (
  artifact_id CHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  workspace_name VARCHAR(191) NOT NULL,
  task_id VARCHAR(512) NOT NULL,
  session_id VARCHAR(512) NOT NULL,
  patch_version INT NOT NULL,
  file_path TEXT NOT NULL,
  change_type ENUM('added','modified','deleted') NOT NULL,
  content MEDIUMTEXT NULL,
  diff_text MEDIUMTEXT NULL,
  unavailable_reason VARCHAR(500) NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  KEY idx_review_artifact_lookup (user_id, workspace_name, task_id(191), patch_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sugo_weekly_reports (
  user_id VARCHAR(191) NOT NULL,
  week_id VARCHAR(16) NOT NULL,
  start_date VARCHAR(10) NOT NULL,
  end_date VARCHAR(10) NOT NULL,
  generated_at VARCHAR(64) NOT NULL,
  uploaded_at VARCHAR(64) NOT NULL,
  report_json LONGTEXT NOT NULL,
  PRIMARY KEY (user_id, week_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
