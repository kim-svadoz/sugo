import type { PrRefs } from "../prRefs.js";
import type { WorkResultReport } from "../workResultReport.js";

export type TaskStatus = "pending" | "idea" | "in_progress" | "done" | "dropped" | "archived";

/** Patch: patch가 기존 Run(=이 Task)을 재사용할 때 남기는 계보 정보.
 * parentTaskId는 "base work-result를 소유한 태스크"를 가리킨다 — Run을 재사용하는 설계라 보통
 * 이 Task 자신의 id와 같다(자기참조 — 대시보드가 "이건 patch로 이어진 태스크"임을 알 수 있게). */
export interface TaskPatchInfo {
  parentTaskId: string;
  patchVersion: number;
  /** patch 시작 시 기준이 된 직전 차수의 work-result. Roadmap 계보 복구에 쓴다. */
  baseWorkResultPath?: string;
  seed?: string;
  /** 해당 차수 PRD의 사람이 읽는 핵심 제목. */
  title?: string;
  /** 제목 복구와 계보 감사에 사용하는 해당 차수 PRD 경로. */
  prdPath?: string;
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
  /** soft delete(ISO). 있으면 목록에서 숨지만 데이터는 그대로다 — 재사용 시 해제된다. */
  deleted_at?: string;
}

export interface Checkpoint {
  id: string;
  title: string;
  category?: string;
  applies_to?: string[];
  checklist: string[];
  created_at?: string;
  expires_at?: string;
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
  /** commit 시점에 collectPrRefs(git 원격/브랜치)로 채워 대시보드의 "Create PR"
   * 버튼에 급전한다. PR 생성 자체는 대시보드 책임(범위 밖). */
  prRefs?: PrRefs;
}

// ── Roadmap DAG ─────────────────────────────────────────────────────────

export const ROADMAP_LEVELS = ["spec", "workstream", "task", "subtask", "step"] as const;
export type RoadmapLevel = (typeof ROADMAP_LEVELS)[number];

export const ROADMAP_NODE_STATUSES = ["pending", "in_progress", "done", "blocked", "dropped"] as const;
export type RoadmapNodeStatus = (typeof ROADMAP_NODE_STATUSES)[number];

export interface RoadmapNodeResult {
  summary?: string;
  logId?: string;
}

export interface RoadmapWorkResult {
  sourceRevision?: import("../sourceRevision.js").SourceRevision;
  path?: string;
  startedAt?: string;
  endedAt?: string;
  model?: string;
  summary?: string;
  files?: { path: string; change: "added" | "modified" | "deleted"; content?: string; diff?: string; unavailableReason?: string }[];
  parentTaskId?: string;
  patchVersion?: number;
  seed?: string;
  runtimeVerified?: boolean;
  wiringVerified?: boolean;
  prRefs?: PrRefs;
  /** v1 표준 리포트. summary/files 상위 필드는 구버전 Dashboard와의 호환을 위해 유지한다. */
  report?: WorkResultReport;
}

export interface RoadmapLineageEntry {
  version: number;
  completedAt: string;
  title?: string;
  summary?: string;
  changedFiles?: string[];
  seed?: string;
  runtimeVerified?: boolean;
  wiringVerified?: boolean;
  /** 이 차수가 끝난 시점의 REQ 스냅샷. 다음 patch가 같은 Task의 REQ를 교체해도 과거를 보존한다. */
  requirements?: { id: string; title: string; status: RoadmapNodeStatus }[];
  /** 차수별 Inspector/다음 patch 진입점. Task의 workResult는 최신 차수만 가리킨다. */
  workResult?: RoadmapWorkResult;
}

export interface RoadmapNode {
  id: string;
  title: string;
  level: RoadmapLevel;
  status: RoadmapNodeStatus;
  /** "from이 to를 기다림" 실행 엣지 — 이 노드가 시작되려면 여기 담긴 id들이 먼저 done이어야 한다. */
  dependsOn: string[];
  parent?: string;
  ref?: string;
  specPath?: string;
  note?: string;
  humanBlocker?: HumanBlocker;
  /** Ontology projection v1. 플러그인이 계산하고 Dashboard는 해석을 복제하지 않고 소비한다. */
  runtimeAssessment?: import("../ontology/sessionAssessment.js").SessionAssessment;
  result?: RoadmapNodeResult;
  workResult?: RoadmapWorkResult;
  lineage?: RoadmapLineageEntry[];
  /** 소유권 경계: 이 3개 필드는 대시보드가 SOT다 — 로컬(fetchRoadmapOrdering 병합) 외에는
   * 절대 덮어쓰지 않는다. dependsOn도 마찬가지로 "최초 1회 seed 이후엔 대시보드가 SOT"지만,
   * 로컬에서도 계속 쓰는 실행 필드라 별도 표시 없이 dependsOn 필드 자체를 공유한다. */
  manual_status?: string;
  pos_x?: number;
  pos_y?: number;
}

export interface HumanBlockerOption {
  id: string;
  label: string;
  impact: string;
}

export interface HumanBlocker {
  schemaVersion: 1;
  kind?: "decision" | "review_confirmation";
  sessionId: string;
  stage: string;
  resumeAction: string;
  summary: string;
  question: string;
  context: string[];
  options: HumanBlockerOption[];
  blockedNextStep: string;
  createdAt: string;
  reviewPacket?: {
    report?: WorkResultReport;
    summary: string;
    changes: string[];
    tests: string[];
    designDecisions: string[];
    knownLimitations: string[];
    files?: Array<{
      path: string;
      change: "added" | "modified" | "deleted";
      unavailableReason?: string;
    }>;
  };
}

export interface RoadmapFile {
  nodes: RoadmapNode[];
  schemaVersion: number;
}
