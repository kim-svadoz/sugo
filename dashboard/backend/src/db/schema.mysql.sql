-- Sugo Dashboard schema (MySQL, production target). See spec/sugo-dashboard-spec-v1.md §2.
-- Simplification: tables that the original creates lazily at runtime
-- (activity_events, bitbucket_tokens) are declared up front here instead — same
-- end-state shape, no meaningful behavioral difference for a fresh reimplementation.

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

-- SaaS(공개 배포) 전용: 플러그인이 sync 시 Bearer로 보내는 개인 API 토큰. 평문은 저장하지
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
