import type { Checkpoint, RoadmapNode, Spec, Task, WorkLog } from "../hulk/types.js";
import type { PrRefs } from "../prRefs.js";

/**
 * §7.2 seam 직렬화 어댑터 — 플러그인 도메인 객체(snake_case, 중첩)를 대시보드 REST API가 기대하는
 * **평평한 wire 포맷(camelCase, top-level 필드)**으로 변환한다.
 *
 * 변환 방향이 이쪽인 이유: 대시보드가 수신 계약의 주인이다(§2 "DB가 진실"). 플러그인이 맞춘다.
 * 이 파일은 **형태 변환만** 한다 — 경로는 양쪽이 `roadmap`으로 일치하므로 URL은 건드리지 않는다.
 */

/** 대시보드 task status enum(pending|in_progress|done|archived)에 없는 플러그인 값(idea/dropped)을 매핑. */
export function serializeTaskStatus(status: Task["status"]): "pending" | "in_progress" | "done" | "archived" {
  if (status === "idea") return "pending";
  if (status === "dropped") return "archived";
  return status;
}

export interface TaskWire {
  userId: string;
  workspaceName: string;
  id: string;
  title: string;
  project?: string;
  status: string;
  priority?: string;
  description?: string;
  summary?: string;
  startedAt?: string;
  completedAt?: string;
}

export function serializeTask(userId: string, workspaceName: string, task: Task): TaskWire {
  return {
    userId,
    workspaceName,
    id: task.id,
    title: task.title,
    project: task.project,
    status: serializeTaskStatus(task.status),
    priority: task.priority,
    description: task.description,
    summary: task.summary,
    startedAt: task.started_at,
    completedAt: task.completed_at,
  };
}

export interface HistoryWire {
  userId: string;
  workspaceName: string;
  id: string;
  taskId?: string;
  taskTitle?: string;
  summary?: string;
  keyDecisions?: string[];
  filesChanged?: string[];
  completedAt?: string;
  estimatedHumanHours?: number;
  userReportedHumanHours?: number;
  aiExecutionMinutes?: number;
  estimationBasis?: string;
}

export function serializeHistory(userId: string, workspaceName: string, workLog: WorkLog): HistoryWire {
  return {
    userId,
    workspaceName,
    id: workLog.id,
    taskId: workLog.task_id,
    taskTitle: workLog.task_title,
    summary: workLog.summary,
    keyDecisions: workLog.key_decisions,
    filesChanged: workLog.files_changed,
    completedAt: workLog.completed_at,
    estimatedHumanHours: workLog.metrics?.estimatedHumanHours,
    userReportedHumanHours: workLog.metrics?.userReportedHumanHours,
    aiExecutionMinutes: workLog.metrics?.aiExecutionMinutes,
    estimationBasis: workLog.metrics?.estimationBasis,
  };
}

export interface CheckpointWire {
  userId: string;
  workspaceName: string;
  id: string;
  title: string;
  category?: string;
  appliesTo?: string[];
  checklist?: string[];
  checkpointDate?: string;
  expiresAt?: string;
}

export function serializeCheckpoint(userId: string, workspaceName: string, cp: Checkpoint): CheckpointWire {
  return {
    userId,
    workspaceName,
    id: cp.id,
    title: cp.title,
    category: cp.category,
    appliesTo: cp.applies_to,
    checklist: cp.checklist,
    checkpointDate: cp.created_at,
    expiresAt: cp.expires_at,
  };
}

export interface DecisionWire {
  userId: string;
  workspaceName: string;
  id: string;
  title: string;
  status: string;
  content?: string;
  decisionDate?: string;
}

/** §7.2 "POST /api/sync/decision(ADR) — sugo_spec(add)가 트리거". Spec을 ADR로 취급한다.
 * Spec에는 id/title이 없고 name이 식별자이므로 name을 id와 title 양쪽에 매핑한다. */
export function serializeDecision(userId: string, workspaceName: string, spec: Spec): DecisionWire {
  return {
    userId,
    workspaceName,
    id: spec.name,
    title: spec.name,
    status: "accepted",
    content: spec.content,
    decisionDate: spec.created_at,
  };
}

export interface RoadmapNodeWire {
  id: string;
  title: string;
  level: string;
  status: string;
  dependsOn?: string[];
  parent?: string;
  ref?: string;
  note?: string;
  specPath?: string;
  workResult?: unknown;
  lineage?: unknown;
  humanBlocker?: unknown;
}

/** RoadmapNode → 대시보드 roadmap 노드 wire. 필드명이 이미 camelCase로 정렬돼 있어(dependsOn/specPath/
 * workResult) 대부분 통과하지만, 플러그인 전용 `result` 필드는 대시보드가 모르므로 떨군다. */
export function serializeRoadmapNode(node: RoadmapNode): RoadmapNodeWire {
  return {
    id: node.id,
    title: node.title,
    level: node.level,
    status: node.status,
    dependsOn: node.dependsOn,
    parent: node.parent,
    ref: node.ref,
    note: node.note,
    specPath: node.specPath,
    workResult: node.workResult,
    lineage: node.lineage,
    humanBlocker: node.humanBlocker,
  };
}

export interface RoadmapSnapshotWire {
  userId: string;
  workspaceName: string;
  nodes: RoadmapNodeWire[];
}

export function serializeRoadmapSnapshot(userId: string, workspaceName: string, nodes: RoadmapNode[]): RoadmapSnapshotWire {
  return { userId, workspaceName, nodes: nodes.map(serializeRoadmapNode) };
}

export interface WorkspaceWire {
  userId: string;
  name: string;
  projects: string[];
  gitSyncedProjects: string[];
  createdAt: string;
  updatedAt: string;
}

/** prRefs는 §7.2에서 roadmap 노드의 workResult.prRefs로 흐르는 게 정본 경로다. 대시보드 history
 * 스키마엔 prRefs 필드가 없어(zod가 떨군다) history로 실어보내도 소비되지 않는다 — 이 어댑터는
 * history wire에서 prRefs를 의도적으로 제외한다(죽은 필드 안 보냄). */
export type { PrRefs };
