import { Router } from "express";
import type { z } from "zod";
import type { DbClient } from "../db/client.js";
import {
  bulkSyncSchema,
  checkpointSchema,
  decisionSchema,
  entityDeleteSchema,
  historySchema,
  pluginVersionSchema,
  roadmapSyncSchema,
  taskSchema,
  workspaceDeleteSchema,
  workspaceMetaSchema,
  workspaceSchema,
  userSchema,
} from "../schemas/sync.js";
import { validateBody } from "../schemas/validate.js";
import {
  deleteCheckpoint,
  deleteDecision,
  deleteHistory,
  deleteTask,
  deleteWorkspace,
  getPluginVersion,
  syncCheckpoint,
  syncDecision,
  syncHistory,
  syncPluginVersion,
  syncRoadmap,
  syncTask,
  syncUser,
  syncWorkspace,
  syncWorkspaceMeta,
} from "../services/syncService.js";

// §3.1: all PUBLIC (no auth) - the plugin trusts userId in the body/query,
// and every handler responds fast/non-blocking per the seam contract.
export function createSyncRouter(db: DbClient): Router {
  const router = Router();

  router.get("/plugin-version", async (req, res) => {
    const userId = String(req.query.userId ?? "");
    if (!userId) return res.status(400).json({ error: "userId required" });
    const version = await getPluginVersion(db, userId);
    res.json({ version });
  });

  router.post("/plugin-version", validateBody(pluginVersionSchema), async (req, res) => {
    await syncPluginVersion(db, req.body.userId, req.body.version);
    res.json({ ok: true });
  });

  router.post("/user", validateBody(userSchema), async (req, res) => {
    await syncUser(db, req.body);
    res.json({ ok: true });
  });

  router.post("/workspace", validateBody(workspaceSchema), async (req, res) => {
    await syncWorkspace(db, req.body);
    res.json({ ok: true });
  });

  router.delete("/workspace", validateBody(workspaceDeleteSchema), async (req, res) => {
    await deleteWorkspace(db, req.body.userId, req.body.name);
    res.json({ ok: true });
  });

  router.post("/task", validateBody(taskSchema), async (req, res) => {
    await syncTask(db, req.body);
    res.json({ ok: true });
  });

  router.delete("/task", validateBody(entityDeleteSchema), async (req, res) => {
    await deleteTask(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  });

  router.post("/history", validateBody(historySchema), async (req, res) => {
    await syncHistory(db, req.body);
    res.json({ ok: true });
  });

  router.delete("/history", validateBody(entityDeleteSchema), async (req, res) => {
    await deleteHistory(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  });

  router.post("/decision", validateBody(decisionSchema), async (req, res) => {
    await syncDecision(db, req.body);
    res.json({ ok: true });
  });

  router.delete("/decision", validateBody(entityDeleteSchema), async (req, res) => {
    await deleteDecision(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  });

  router.post("/checkpoint", validateBody(checkpointSchema), async (req, res) => {
    await syncCheckpoint(db, req.body);
    res.json({ ok: true });
  });

  router.delete("/checkpoint", validateBody(entityDeleteSchema), async (req, res) => {
    await deleteCheckpoint(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  });

  router.post("/workspace-meta", validateBody(workspaceMetaSchema), async (req, res) => {
    await syncWorkspaceMeta(db, req.body);
    res.json({ ok: true });
  });

  router.post("/roadmap", validateBody(roadmapSyncSchema), async (req, res) => {
    await syncRoadmap(db, req.body.userId, req.body.workspaceName, req.body.nodes);
    res.json({ ok: true });
  });

  router.post("/bulk", validateBody(bulkSyncSchema), async (req, res) => {
    const body = req.body as z.infer<typeof bulkSyncSchema>;
    for (const u of body.users ?? []) await syncUser(db, u);
    for (const w of body.workspaces ?? []) await syncWorkspace(db, w);
    for (const t of body.tasks ?? []) await syncTask(db, t);
    for (const h of body.history ?? []) await syncHistory(db, h);
    for (const d of body.decisions ?? []) await syncDecision(db, d);
    for (const c of body.checkpoints ?? []) await syncCheckpoint(db, c);
    for (const m of body.workspaceMeta ?? []) await syncWorkspaceMeta(db, m);
    for (const r of body.roadmap ?? []) await syncRoadmap(db, r.userId, r.workspaceName, r.nodes);
    res.json({ ok: true });
  });

  return router;
}
