import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth/requireUser.js";
import type { DbClient } from "../db/client.js";
import { validateBody } from "../schemas/validate.js";
import { createScheduleMemo, deleteScheduleMemo, listArchivedScheduleMemos, listScheduleMemos, restoreScheduleMemo, setScheduleMemoDueDate, updateScheduleMemo } from "../services/scheduleMemoService.js";
import {
  completeScheduleCommitment,
  createScheduleCommitment,
  deleteScheduleCommitment,
  listScheduleCommitments,
  reopenScheduleCommitment,
  updateScheduleCommitment,
} from "../services/scheduleCommitmentService.js";
import { archiveScheduleSpec, listScheduleSpecArchives, restoreScheduleSpec } from "../services/scheduleSpecArchiveService.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const memoBody = z.object({
  title: z.string().trim().min(1).max(512),
  contentMd: z.string().max(200_000),
  dueDate: date,
}).strict();
const commitmentState = z.enum(["planned", "active", "completed", "cancelled"]);
const commitmentTarget = z.enum(["implementation", "review", "dev", "stg", "prd", "custom"]);
const createCommitmentBody = z.object({
  workspaceName: z.string().trim().min(1).max(255),
  specId: z.string().trim().min(1).max(191),
  title: z.string().trim().min(1).max(512),
  dueDate: date,
  state: commitmentState.optional(),
  target: commitmentTarget,
  linkedRunId: z.string().trim().min(1).max(191).nullable().optional(),
}).strict();
const updateCommitmentBody = z.object({
  title: z.string().trim().min(1).max(512),
  dueDate: date,
  state: commitmentState,
  target: commitmentTarget,
  linkedRunId: z.string().trim().min(1).max(191).nullable(),
}).strict();
const specArchiveBody = z.object({
  workspaceName: z.string().trim().min(1).max(255),
  specId: z.string().trim().min(1).max(191),
  reason: z.enum(["deleted", "closed"]),
}).strict();
const specRestoreBody = specArchiveBody.omit({ reason: true });

export function createScheduleRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));

  router.get("/memos", async (_req, res, next) => {
    try { res.json({ memos: await listScheduleMemos(db, _req.userId!) }); } catch (error) { next(error); }
  });
  router.get("/memos/archive", async (req, res, next) => {
    try { res.json({ memos: await listArchivedScheduleMemos(db, req.userId!) }); } catch (error) { next(error); }
  });
  router.post("/memos", validateBody(memoBody), async (req, res, next) => {
    try { res.status(201).json({ memo: await createScheduleMemo(db, req.userId!, req.body) }); } catch (error) { next(error); }
  });
  router.put("/memos/:id", validateBody(memoBody), async (req, res, next) => {
    try {
      const memo = await updateScheduleMemo(db, req.userId!, req.params.id, req.body);
      if (!memo) return void res.status(404).json({ error: "MEMO_NOT_FOUND" });
      res.json({ memo });
    } catch (error) { next(error); }
  });
  router.patch("/memos/:id/due-date", validateBody(z.object({ dueDate: date }).strict()), async (req, res, next) => {
    try {
      if (!await setScheduleMemoDueDate(db, req.userId!, req.params.id, req.body.dueDate)) return void res.status(404).json({ error: "MEMO_NOT_FOUND" });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  router.delete("/memos/:id", async (req, res, next) => {
    try {
      if (!await deleteScheduleMemo(db, req.userId!, req.params.id)) return void res.status(404).json({ error: "MEMO_NOT_FOUND" });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  router.post("/memos/:id/restore", async (req, res, next) => {
    try {
      if (!await restoreScheduleMemo(db, req.userId!, req.params.id)) return void res.status(404).json({ error: "ARCHIVED_MEMO_NOT_FOUND" });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.get("/commitments", async (req, res, next) => {
    try { res.json({ commitments: await listScheduleCommitments(db, req.userId!) }); } catch (error) { next(error); }
  });
  router.get("/specs/archive", async (req, res, next) => {
    try { res.json({ specs: await listScheduleSpecArchives(db, req.userId!) }); } catch (error) { next(error); }
  });
  router.post("/specs/archive", validateBody(specArchiveBody), async (req, res, next) => {
    try {
      const spec = await archiveScheduleSpec(db, req.userId!, req.body.workspaceName, req.body.specId, req.body.reason);
      if (!spec) return void res.status(404).json({ error: "SPEC_NOT_FOUND" });
      res.json({ spec });
    } catch (error) { next(error); }
  });
  router.post("/specs/restore", validateBody(specRestoreBody), async (req, res, next) => {
    try {
      if (!await restoreScheduleSpec(db, req.userId!, req.body.workspaceName, req.body.specId)) return void res.status(404).json({ error: "ARCHIVED_SPEC_NOT_FOUND" });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  router.post("/commitments", validateBody(createCommitmentBody), async (req, res, next) => {
    try {
      const commitment = await createScheduleCommitment(db, req.userId!, req.body);
      if (!commitment) return void res.status(404).json({ error: "SPEC_NOT_FOUND" });
      res.status(201).json({ commitment });
    } catch (error) { next(error); }
  });
  router.put("/commitments/:id", validateBody(updateCommitmentBody), async (req, res, next) => {
    try {
      const commitment = await updateScheduleCommitment(db, req.userId!, req.params.id, req.body);
      if (!commitment) return void res.status(404).json({ error: "COMMITMENT_NOT_FOUND" });
      res.json({ commitment });
    } catch (error) { next(error); }
  });
  router.post("/commitments/:id/complete", async (req, res, next) => {
    try {
      const commitment = await completeScheduleCommitment(db, req.userId!, req.params.id);
      if (!commitment) return void res.status(404).json({ error: "COMMITMENT_NOT_FOUND" });
      res.json({ commitment });
    } catch (error) { next(error); }
  });
  router.post("/commitments/:id/reopen", async (req, res, next) => {
    try {
      const commitment = await reopenScheduleCommitment(db, req.userId!, req.params.id);
      if (!commitment) return void res.status(404).json({ error: "COMMITMENT_NOT_FOUND" });
      res.json({ commitment });
    } catch (error) { next(error); }
  });
  router.delete("/commitments/:id", async (req, res, next) => {
    try {
      if (!await deleteScheduleCommitment(db, req.userId!, req.params.id)) {
        return void res.status(404).json({ error: "COMMITMENT_NOT_FOUND" });
      }
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  return router;
}
