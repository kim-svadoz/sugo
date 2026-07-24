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

const canvasNodeSchema = z.object({
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
});

export const canvasSyncSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  nodes: z.array(canvasNodeSchema),
});

export const bulkSyncSchema = z.object({
  users: z.array(userSchema).optional(),
  workspaces: z.array(workspaceSchema).optional(),
  tasks: z.array(taskSchema).optional(),
  history: z.array(historySchema).optional(),
  decisions: z.array(decisionSchema).optional(),
  checkpoints: z.array(checkpointSchema).optional(),
  workspaceMeta: z.array(workspaceMetaSchema).optional(),
  canvas: z.array(canvasSyncSchema).optional(),
});

export const activityIngestSchema = z.object({
  userId: z.string().min(1),
  workspace: z.string().min(1),
  ts: z.string().optional(),
  level: z.enum(["AGENT", "INFO", "WARN", "ERROR", "SYSTEM"]).optional(),
  agent: z.enum(["MAIN", "CODE", "TEST", "REVIEW", "DOCS"]).nullish(),
  handoffTo: z.enum(["MAIN", "CODE", "TEST", "REVIEW", "DOCS"]).nullish(),
  eventType: z.enum(["EXECUTE", "HANDOFF", "COMPLETED", "SYSTEM"]).optional(),
  message: z.string().min(1),
  details: z.unknown().optional(),
});
