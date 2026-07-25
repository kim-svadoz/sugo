import { Router } from "express";
import type { DbClient } from "../db/client.js";
import {
  bulkSyncSchema,
  checkpointSchema,
  decisionSchema,
  entityDeleteSchema,
  historySchema,
  pluginVersionSchema,
  canvasSyncSchema,
  taskSchema,
  workspaceDeleteSchema,
  workspaceMetaSchema,
  workspaceSchema,
  userSchema,
} from "../schemas/sync.js";
import { z } from "zod";
import { validateBody } from "../schemas/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
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
  syncCanvas,
  syncTask,
  syncUser,
  syncWorkspace,
  syncWorkspaceMeta,
} from "../services/syncService.js";
import { linkCanvasNodes, unlinkCanvasNodes } from "../services/workspaceService.js";

const canvasLinkSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
});

// §3.1: all PUBLIC (no auth) - the plugin trusts userId in the body/query,
// and every handler responds fast/non-blocking per the seam contract.
export function createSyncRouter(db: DbClient): Router {
  const router = Router();

  router.get("/plugin-version", asyncHandler(async (req, res) => {
    const userId = String(req.query.userId ?? "");
    if (!userId) return res.status(400).json({ error: "userId required" });
    const version = await getPluginVersion(db, userId);
    res.json({ version });
  }));

  router.post("/plugin-version", validateBody(pluginVersionSchema), asyncHandler(async (req, res) => {
    await syncPluginVersion(db, req.body.userId, req.body.version);
    res.json({ ok: true });
  }));

  router.post("/user", validateBody(userSchema), asyncHandler(async (req, res) => {
    await syncUser(db, req.body);
    res.json({ ok: true });
  }));

  router.post("/workspace", validateBody(workspaceSchema), asyncHandler(async (req, res) => {
    await syncWorkspace(db, req.body);
    res.json({ ok: true });
  }));

  router.delete("/workspace", validateBody(workspaceDeleteSchema), asyncHandler(async (req, res) => {
    await deleteWorkspace(db, req.body.userId, req.body.name);
    res.json({ ok: true });
  }));

  router.post("/task", validateBody(taskSchema), asyncHandler(async (req, res) => {
    await syncTask(db, req.body);
    res.json({ ok: true });
  }));

  router.delete("/task", validateBody(entityDeleteSchema), asyncHandler(async (req, res) => {
    await deleteTask(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  }));

  router.post("/history", validateBody(historySchema), asyncHandler(async (req, res) => {
    await syncHistory(db, req.body);
    res.json({ ok: true });
  }));

  router.delete("/history", validateBody(entityDeleteSchema), asyncHandler(async (req, res) => {
    await deleteHistory(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  }));

  router.post("/decision", validateBody(decisionSchema), asyncHandler(async (req, res) => {
    await syncDecision(db, req.body);
    res.json({ ok: true });
  }));

  router.delete("/decision", validateBody(entityDeleteSchema), asyncHandler(async (req, res) => {
    await deleteDecision(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  }));

  router.post("/checkpoint", validateBody(checkpointSchema), asyncHandler(async (req, res) => {
    await syncCheckpoint(db, req.body);
    res.json({ ok: true });
  }));

  router.delete("/checkpoint", validateBody(entityDeleteSchema), asyncHandler(async (req, res) => {
    await deleteCheckpoint(db, req.body.userId, req.body.workspaceName, req.body.id);
    res.json({ ok: true });
  }));

  router.post("/workspace-meta", validateBody(workspaceMetaSchema), asyncHandler(async (req, res) => {
    await syncWorkspaceMeta(db, req.body);
    res.json({ ok: true });
  }));

  router.post("/canvas", validateBody(canvasSyncSchema), asyncHandler(async (req, res) => {
    await syncCanvas(db, req.body.userId, req.body.workspaceName, req.body.nodes);
    res.json({ ok: true });
  }));

  // §7.2 "POST /api/sync/canvas/link + DELETE (링크 편집 전파)": 플러그인이 로컬에서 편집한
  // 링크를 push한다. 스냅샷 replace와 별개 신호 — dependsOn 편집 의도를 그대로 적용한다
  // (fail-closed task↔task + 사이클 가드는 workspaceService가 이미 담당). 논블로킹이라 결과 상관없이 200.
  router.post("/canvas/link", validateBody(canvasLinkSchema), asyncHandler(async (req, res) => {
    await linkCanvasNodes(db, req.body.userId, req.body.workspaceName, req.body.fromId, req.body.toId);
    res.json({ ok: true });
  }));

  router.delete("/canvas/link", validateBody(canvasLinkSchema), asyncHandler(async (req, res) => {
    await unlinkCanvasNodes(db, req.body.userId, req.body.workspaceName, req.body.fromId, req.body.toId);
    res.json({ ok: true });
  }));

  router.post("/bulk", validateBody(bulkSyncSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof bulkSyncSchema>;
    for (const u of body.users ?? []) await syncUser(db, u);
    for (const w of body.workspaces ?? []) await syncWorkspace(db, w);
    for (const t of body.tasks ?? []) await syncTask(db, t);
    for (const h of body.history ?? []) await syncHistory(db, h);
    for (const d of body.decisions ?? []) await syncDecision(db, d);
    for (const c of body.checkpoints ?? []) await syncCheckpoint(db, c);
    for (const m of body.workspaceMeta ?? []) await syncWorkspaceMeta(db, m);
    for (const r of body.canvas ?? []) await syncCanvas(db, r.userId, r.workspaceName, r.nodes);
    res.json({ ok: true });
  }));

  return router;
}
