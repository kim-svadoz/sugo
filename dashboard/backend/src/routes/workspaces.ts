import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { validateBody } from "../schemas/validate.js";
import { requireUser } from "../auth/requireUser.js";
import {
  checkpointCreateSchema,
  checkpointUpdateSchema,
  groupCreateSchema,
  linkSchema,
  manualStatusClearSchema,
  manualStatusSchema,
  parentSchema,
  positionSchema,
  renameSchema,
} from "../schemas/workspaces.js";
import {
  clearManualStatus,
  createCheckpoint,
  createRoadmapGroup,
  deleteCheckpointRow,
  deleteRoadmapGroup,
  getCheckpointSync,
  getCheckpoints,
  getDecisions,
  getHistory,
  getRecentHistory,
  getRoadmap,
  getSpecContent,
  getTasks,
  linkRoadmapNodes,
  listWorkspaces,
  renameRoadmapNode,
  searchWorkspaces,
  setManualStatus,
  setRoadmapParent,
  setRoadmapPosition,
  unlinkRoadmapNodes,
  updateCheckpoint,
} from "../services/workspaceService.js";

function requireUserId(req: import("express").Request, res: import("express").Response): string | null {
  // 공개 SaaS(§Phase 1): 신원은 인증 미들웨어가 세운 req.userId(토큰)만 신뢰. query userId 무시.
  const userId = req.userId ?? "";
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return userId;
}

function respondMutation(res: import("express").Response, result: { ok: true } | { ok: false; error: string; message: string }) {
  if (result.ok) {
    res.json({ ok: true });
  } else {
    res.status(409).json(result);
  }
}

// §3.3: all PUBLIC, userId via query. Dashboard owns roadmap structure/order here.
export function createWorkspacesRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));

  router.get("/", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.json({ workspaces: await listWorkspaces(db, userId) });
  });

  router.get("/recent-history", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const limit = Number(req.query.limit ?? 20);
    res.json({ history: await getRecentHistory(db, userId, Number.isFinite(limit) ? limit : 20) });
  });

  router.get("/search", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const q = String(req.query.q ?? "");
    res.json({ results: await searchWorkspaces(db, userId, q) });
  });

  router.get("/checkpoint-sync", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.json({ checkpoints: await getCheckpointSync(db, userId) });
  });

  router.get("/:name/decisions", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.json({ decisions: await getDecisions(db, userId, req.params.name) });
  });

  router.get("/:name/history", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.json({ history: await getHistory(db, userId, req.params.name) });
  });

  router.get("/:name/checkpoints", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.json({ checkpoints: await getCheckpoints(db, userId, req.params.name) });
  });

  router.get("/:name/tasks", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.json({ tasks: await getTasks(db, userId, req.params.name) });
  });

  router.get("/:name/roadmap", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    res.json({ nodes: await getRoadmap(db, userId, req.params.name) });
  });

  // §3.3 Spec 원문 팝업(slug 매칭). title(또는 path 마지막 세그먼트)로 decision content를 찾는다.
  router.get("/:name/spec-content", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const title = String(req.query.title ?? req.query.path ?? "");
    if (!title) return res.status(400).json({ error: "title or path required" });
    const result = await getSpecContent(db, userId, req.params.name, title);
    if (!result) return res.status(404).json({ error: "not_found" });
    res.json(result);
  });

  router.post("/:name/checkpoints", validateBody(checkpointCreateSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await createCheckpoint(db, userId, req.params.name, req.body);
    res.json({ ok: true });
  });

  router.put("/:name/checkpoints/:id", validateBody(checkpointUpdateSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await updateCheckpoint(db, userId, req.params.name, req.params.id, req.body);
    res.json({ ok: true });
  });

  router.delete("/:name/checkpoints/:id", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await deleteCheckpointRow(db, userId, req.params.name, req.params.id);
    res.json({ ok: true });
  });

  router.post("/:name/roadmap/link", validateBody(linkSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const result = await linkRoadmapNodes(db, userId, req.params.name, req.body.from, req.body.to);
    respondMutation(res, result);
  });

  router.delete("/:name/roadmap/link", validateBody(linkSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const result = await unlinkRoadmapNodes(db, userId, req.params.name, req.body.from, req.body.to);
    respondMutation(res, result);
  });

  router.post("/:name/roadmap/group", validateBody(groupCreateSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const { groupId, title, members, sequential } = req.body;
    const result = await createRoadmapGroup(db, userId, req.params.name, groupId, title, members, Boolean(sequential));
    respondMutation(res, result);
  });

  router.delete("/:name/roadmap/group/:groupId", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await deleteRoadmapGroup(db, userId, req.params.name, req.params.groupId);
    res.json({ ok: true });
  });

  router.post("/:name/roadmap/parent", validateBody(parentSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await setRoadmapParent(db, userId, req.params.name, req.body.nodeId, req.body.parentId);
    res.json({ ok: true });
  });

  router.post("/:name/roadmap/rename", validateBody(renameSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await renameRoadmapNode(db, userId, req.params.name, req.body.nodeId, req.body.title);
    res.json({ ok: true });
  });

  router.post("/:name/roadmap/manual-status", validateBody(manualStatusSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await setManualStatus(db, userId, req.params.name, req.body.nodeId, req.body.status, userId);
    res.json({ ok: true });
  });

  router.delete("/:name/roadmap/manual-status", validateBody(manualStatusClearSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await clearManualStatus(db, userId, req.params.name, req.body.nodeId);
    res.json({ ok: true });
  });

  router.post("/:name/roadmap/position", validateBody(positionSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await setRoadmapPosition(db, userId, req.params.name, req.body.nodeId, req.body.x, req.body.y);
    res.json({ ok: true });
  });

  return router;
}
