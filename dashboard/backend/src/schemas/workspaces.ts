import { z } from "zod";

export const checkpointCreateSchema = z.object({
  id: z.string().min(1).optional(),
  category: z.string().optional(),
  title: z.string().min(1),
  learnedFrom: z.string().nullish(),
  checklist: z.unknown().optional(),
  appliesTo: z.unknown().optional(),
  checkpointDate: z.string().nullish(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const checkpointUpdateSchema = checkpointCreateSchema.omit({ id: true }).partial();

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

/** §7B Schedule 탭. dueDate는 'YYYY-MM-DD' 또는 명시적 null(기한 미정으로 되돌림). */
export const dueDateSchema = z.object({
  nodeId: z.string().min(1),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

/** §7B 경량 Spec 생성 — Run/Task 없이 단독 level='spec' 노드만 만든다. */
export const quickSpecSchema = z.object({
  title: z.string().min(1),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  projectPath: z.string().nullish(),
});

/** §7B 스펙별 프로젝트 지정 — dueDateSchema와 같은 형태(null이면 해제). */
export const setProjectSchema = z.object({
  nodeId: z.string().min(1),
  projectPath: z.string().nullable(),
});

export const setSpecDocumentSchema = z.object({
  nodeId: z.string().min(1),
  specPath: z.string().min(1),
});

export const updateSpecDocumentContentSchema = z.object({
  nodeId: z.string().min(1),
  content: z.string().min(1).max(1_000_000),
});
