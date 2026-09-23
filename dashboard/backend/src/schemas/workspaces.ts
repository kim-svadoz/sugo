import { z } from "zod";

export const checkpointCreateSchema = z.object({
  id: z.string().min(1).optional(),
  category: z.string().optional(),
  title: z.string().min(1),
  learnedFrom: z.string().nullish(),
  checklist: z.unknown().optional(),
  appliesTo: z.unknown().optional(),
  checkpointDate: z.string().nullish(),
  apply: z.boolean().optional(),
});

export const checkpointUpdateSchema = checkpointCreateSchema.omit({ id: true, apply: true }).partial();

export const linkSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const groupCreateSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().min(1),
  members: z.array(z.string()).default([]),
  sequential: z.boolean().optional(),
});

export const parentSchema = z.object({
  nodeId: z.string().min(1),
  parentId: z.string().nullable(),
});

export const renameSchema = z.object({
  nodeId: z.string().min(1),
  title: z.string().min(1),
});

export const manualStatusSchema = z.object({
  nodeId: z.string().min(1),
  status: z.enum(["pending", "in_progress", "done", "blocked", "dropped"]),
});

export const manualStatusClearSchema = z.object({
  nodeId: z.string().min(1),
});

export const positionSchema = z.object({
  nodeId: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

/** §7 orphan RUN → Spec. specId는 명시적 null(분리)을 허용해야 하므로 nullish. */
export const runSpecSchema = z.object({
  nodeId: z.string().optional(),
  runId: z.string().min(1),
  specId: z.string().nullish(),
});
