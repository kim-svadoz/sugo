import type { PrRefs } from "../prRefs.js";

export type TaskStatus = "pending" | "idea" | "in_progress" | "done" | "dropped" | "archived";

/** §7.1 Patch 성숙화: patch가 원본 Run(=이 Task)을 재사용할 때 남기는 계보 정보.
 * parentTaskId는 "base work-result를 소유한 태스크"를 가리킨다 — Run을 재사용하는 설계라 보통
 * 이 Task 자신의 id와 같다(자기참조 — 대시보드가 "이건 patch로 이어진 태스크"임을 알 수 있게). */
export interface TaskPatchInfo {
  parentTaskId: string;
  patchVersion: number;
  seed?: string;
}

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
  patchInfo?: TaskPatchInfo;
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
  /** §7.2 — commit 시점에 collectPrRefs(git 원격/브랜치)로 채워 대시보드의 "Create PR"
   * 버튼에 급전한다. PR 생성 자체는 대시보드 책임(범위 밖). */
  prRefs?: PrRefs;
}

// ── §8.5 Roadmap DAG ─────────────────────────────────────────────────────────

export const ROADMAP_LEVELS = ["spec", "workstream", "task", "subtask", "step"] as const;
export type RoadmapLevel = (typeof ROADMAP_LEVELS)[number];

export const ROADMAP_NODE_STATUSES = ["pending", "in_progress", "done", "blocked", "dropped"] as const;
export type RoadmapNodeStatus = (typeof ROADMAP_NODE_STATUSES)[number];

export interface RoadmapNodeResult {
  summary?: string;
  logId?: string;
}

export interface RoadmapNode {
  id: string;
  title: string;
  level: RoadmapLevel;
  status: RoadmapNodeStatus;
  /** "from이 to를 기다림" 실행 엣지(§8.5) — 이 노드가 시작되려면 여기 담긴 id들이 먼저 done이어야 한다. */
  dependsOn: string[];
  parent?: string;
  ref?: string;
  specPath?: string;
  note?: string;
  result?: RoadmapNodeResult;
  workResult?: string;
  /** §7.2 소유권 경계: 이 3개 필드는 대시보드가 SOT다 — 로컬(fetchRoadmapOrdering 병합) 외에는
   * 절대 덮어쓰지 않는다. dependsOn도 마찬가지로 "최초 1회 seed 이후엔 대시보드가 SOT"지만,
   * 로컬에서도 계속 쓰는 실행 필드라 별도 표시 없이 dependsOn 필드 자체를 공유한다. */
  manual_status?: string;
  pos_x?: number;
  pos_y?: number;
}

export interface RoadmapFile {
  nodes: RoadmapNode[];
  schemaVersion: number;
}
