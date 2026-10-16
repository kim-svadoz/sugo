import { z } from "zod";

export const userSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().optional(),
});

export const workspaceSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  projects: z.array(z.string()).optional(),
  gitSyncedProjects: z.array(z.string()).optional(),
});

export const workspaceDeleteSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  /** §4: 기본은 soft(숨김). true여야 하드 삭제 — 플러그인 §9의 purge와 같은 의미. */
  purge: z.boolean().optional(),
});

export const taskSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  project: z.string().nullish(),
  status: z.enum(["pending", "in_progress", "done", "archived"]).optional(),
  priority: z.string().nullish(),
  description: z.string().nullish(),
  summary: z.string().nullish(),
  startedAt: z.string().nullish(),
  completedAt: z.string().nullish(),
});

export const entityDeleteSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  id: z.string().min(1),
});

export const historySchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  id: z.string().min(1),
  taskId: z.string().nullish(),
  taskTitle: z.string().nullish(),
  summary: z.string().nullish(),
  keyDecisions: z.unknown().optional(),
  filesChanged: z.unknown().optional(),
  notes: z.string().nullish(),
  completedAt: z.string().nullish(),
  estimatedHumanHours: z.number().nullish(),
  userReportedHumanHours: z.number().nullish(),
  aiExecutionMinutes: z.number().nullish(),
  estimationBasis: z.string().nullish(),
});

export const decisionSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().optional(),
  content: z.string().nullish(),
  decisionDate: z.string().nullish(),
});

export const checkpointSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  id: z.string().min(1),
  category: z.string().optional(),
  title: z.string().min(1),
  learnedFrom: z.string().nullish(),
  checklist: z.unknown().optional(),
  appliesTo: z.unknown().optional(),
  checkpointDate: z.string().nullish(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const workspaceMetaSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  goldenRule: z.string().nullish(),
  checkpointsVersion: z.number().optional(),
});

export const pluginVersionSchema = z.object({
  userId: z.string().min(1),
  version: z.string().min(1),
});

const roadmapNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  level: z.enum(["spec", "workstream", "task", "subtask", "step"]),
  status: z.enum(["pending", "in_progress", "done", "blocked", "dropped"]),
  dependsOn: z.array(z.string()).optional(),
  parent: z.string().nullish(),
  ref: z.string().nullish(),
  note: z.string().nullish(),
  specPath: z.string().nullish(),
  workResult: z.unknown().optional(),
  lineage: z.unknown().optional(),
  humanBlocker: z.unknown().optional(),
  runtimeAssessment: z.unknown().optional(),
});

export const roadmapSyncSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  nodes: z.array(roadmapNodeSchema),
});

export const specPathMigrationSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  userId: z.string().min(1),
  mappings: z.array(z.object({
    from: z.string().min(1).max(4096),
    to: z.string().min(1).max(4096),
  }).strict()).min(1).max(1000),
}).strict();

export const reviewArtifactSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  userId: z.string().min(1),
  workspaceName: z.string().min(1).max(191),
  taskId: z.string().min(1).max(512),
  sessionId: z.string().min(1).max(512),
  patchVersion: z.number().int().min(0),
  path: z.string().min(1).max(2048),
  change: z.enum(["added", "modified", "deleted"]),
  content: z.string().max(200_000).optional(),
  diff: z.string().max(400_000).optional(),
  unavailableReason: z.string().max(500).optional(),
}).strict();

export const bulkSyncSchema = z.object({
  users: z.array(userSchema).optional(),
  workspaces: z.array(workspaceSchema).optional(),
  tasks: z.array(taskSchema).optional(),
  history: z.array(historySchema).optional(),
  decisions: z.array(decisionSchema).optional(),
  checkpoints: z.array(checkpointSchema).optional(),
  workspaceMeta: z.array(workspaceMetaSchema).optional(),
  roadmap: z.array(roadmapSyncSchema).optional(),
});

export const activityIngestSchema = z.object({
  userId: z.string().min(1),
  workspace: z.string().min(1).optional(),
  workspaceName: z.string().min(1).optional(),
  ts: z.string().optional(),
  level: z.enum(["AGENT", "INFO", "WARN", "ERROR", "SYSTEM"]).optional(),
  agent: z.enum(["MAIN", "CODE", "TEST", "REVIEW", "DOCS"]).nullish(),
  handoffTo: z.enum(["MAIN", "CODE", "TEST", "REVIEW", "DOCS"]).nullish(),
  eventType: z.enum(["EXECUTE", "HANDOFF", "COMPLETED", "SYSTEM"]).optional(),
  message: z.string().min(1),
  details: z.unknown().optional(),
})
  .refine((value) => Boolean(value.workspace || value.workspaceName), {
    message: "workspace is required",
    path: ["workspace"],
  })
  .transform(({ workspaceName, ...value }) => ({
    ...value,
    workspace: value.workspace ?? workspaceName!,
  }));
