-- Additive migration for Console 0.12.0. No changes to existing execution evidence.
-- Also applied automatically by initDb/ensureHumanCompletionTable at startup.
-- No foreign key: deletion of roadmap nodes must preserve the audit.
CREATE TABLE IF NOT EXISTS sugo_completion_approval_events (
  sequence_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id VARCHAR(36) NOT NULL UNIQUE,
  user_id VARCHAR(255) NOT NULL,
  workspace_name VARCHAR(255) NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  result_key VARCHAR(64) NOT NULL,
  recorded_at VARCHAR(40) NOT NULL,
  event_json LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
