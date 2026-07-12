export type TaskStatus = "pending" | "idea" | "in_progress" | "done" | "dropped" | "archived";

export interface Task {
  id: string;
  title: string;
  project: string;
  status: TaskStatus;
  priority?: string;
  description?: string;
  summary?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  log_id?: string;
  prd_ref?: string;
  tags?: string[];
}

export interface TasksFile {
  tasks: Task[];
  last_updated: string;
  schemaVersion?: number;
}

export interface Workspace {
  name: string;
  projects: string[];
  created_at: string;
}

export interface Checkpoint {
  id: string;
  title: string;
  category?: string;
  applies_to?: string[];
  checklist: string[];
  created_at?: string;
}

export type SpecType = "architecture" | "api-design" | "business-rule" | "data-model" | "flow" | "other";

export interface Spec {
  name: string;
  type: SpecType;
  tags: string[];
  content: string;
  created_at: string;
}

export interface WorkLogMetrics {
  estimatedHumanHours?: number;
  userReportedHumanHours?: number;
  aiExecutionMinutes?: number;
  estimationBasis?: string;
}

export interface WorkLog {
  id: string;
  task_id: string;
  task_title: string;
  completed_at: string;
  summary?: string;
  key_decisions?: string[];
  files_changed?: string[];
  commits?: string[];
  metrics?: WorkLogMetrics;
}
