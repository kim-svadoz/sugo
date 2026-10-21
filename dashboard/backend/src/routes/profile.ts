import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { requireUser } from "../auth/requireUser.js";

const updateSchema = z.object({ displayName: z.string().trim().min(1).max(80) });

export function createProfileRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));
  router.get("/", async (req, res) => {
    const rows = await db.query<{ id: string; display_name: string | null }>("SELECT id, display_name FROM sugo_users WHERE id = ?", [req.userId!]);
    const user = rows[0];
    res.json({ userId: req.userId!, displayName: user?.display_name?.trim() || req.userId! });
  });
  router.put("/", async (req, res) => {
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: "invalid_display_name" });
    await db.exec("UPDATE sugo_users SET display_name = ? WHERE id = ?", [parsed.data.displayName, req.userId!]);
    res.json({ userId: req.userId!, displayName: parsed.data.displayName });
  });
  return router;
}
