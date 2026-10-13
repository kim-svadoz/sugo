import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth/requireUser.js";
import type { DbClient } from "../db/client.js";
import { validateBody } from "../schemas/validate.js";
import { createScheduleMemo, deleteScheduleMemo, listScheduleMemos, setScheduleMemoDueDate, updateScheduleMemo } from "../services/scheduleMemoService.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const memoBody = z.object({
  title: z.string().trim().min(1).max(512),
  contentMd: z.string().max(200_000),
  dueDate: date,
}).strict();

export function createScheduleRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));

  router.get("/memos", async (_req, res, next) => {
    try { res.json({ memos: await listScheduleMemos(db, _req.userId!) }); } catch (error) { next(error); }
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
  return router;
}
