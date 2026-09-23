import { Router } from "express";
import { roadmapCounts, roadmapIssues } from "../services/roadmapGraph.js";
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
  runSpecSchema,
} from "../schemas/workspaces.js";
import {
  clearManualStatus,
  createCheckpoint,
  createRoadmapGroup,
  deleteCheckpointRow,
  deleteRoadmapGroup,
  getCheckpointSync,
  getCheckpoints,
  getCheckpointById,
  getDecisions,
  getHistory,
  getRecentHistory,
  getRoadmap,
  getSpecContent,
  getTasks,
  getWorkspaceProjectPaths,
  linkRoadmapNodes,
  listWorkspaces,
  renameRoadmapNode,
  assignRunToSpec,
  restoreSubtree,
  searchWorkspaces,
  dropSubtree,
  setManualStatus,
  setRoadmapParent,
  setRoadmapPosition,
  unlinkRoadmapNodes,
  updateCheckpoint,
} from "../services/workspaceService.js";
import { applyCheckpointToProjects, newCheckpointId } from "../services/checkpointApply.js";

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
    const workspace = typeof req.query.workspace === "string" ? req.query.workspace : undefined;
    res.json({ checkpoints: await getCheckpointSync(db, userId, workspace) });
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

  // 설계안 RoadmapTab이 `const { counts, issues } = roadmap`으로 받는다. 프론트에서 세지
  // 않고 서버가 세는 이유는, "진행 중심" 필터가 노드를 걸러낸 뒤에도 진행률은 **전체 기준**
  // 이어야 하기 때문이다 — 필터는 보기이지 진척이 아니다.
  router.get("/:name/roadmap", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const nodes = await getRoadmap(db, userId, req.params.name);
    const view = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      level: n.level,
      parent: n.parent,
      status: n.status,
      manualStatus: n.manual_status,
      dependsOn: n.depends_on,
    }));
    res.json({ nodes, counts: roadmapCounts(view), issues: roadmapIssues(view) });
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
    const id = req.body.id ?? newCheckpointId();
    await createCheckpoint(db, userId, req.params.name, { ...req.body, id });
    const application = req.body.apply
      ? await applyCheckpointToProjects({
          workspace: req.params.name,
          checkpoint: {
            id,
            title: req.body.title,
            category: req.body.category,
            appliesTo: req.body.appliesTo,
            checklist: Array.isArray(req.body.checklist) ? req.body.checklist.map(String) : [],
          },
          projectPaths: await getWorkspaceProjectPaths(db, userId, req.params.name),
        })
      : undefined;
    res.json({ ok: true, id, application });
  });

  router.put("/:name/checkpoints/:id", validateBody(checkpointUpdateSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await updateCheckpoint(db, userId, req.params.name, req.params.id, req.body);
    res.json({ ok: true });
  });

  router.post("/:name/checkpoints/:id/apply", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const checkpoint = await getCheckpointById(db, userId, req.params.name, req.params.id);
    if (!checkpoint) return res.status(404).json({ error: "checkpoint_not_found" });
    const application = await applyCheckpointToProjects({
      workspace: req.params.name,
      checkpoint: {
        id: checkpoint.id,
        title: checkpoint.title,
        category: checkpoint.category,
        appliesTo: Array.isArray(checkpoint.applies_to) ? checkpoint.applies_to.map(String) : [],
        checklist: Array.isArray(checkpoint.checklist) ? checkpoint.checklist.map(String) : [],
      },
      projectPaths: await getWorkspaceProjectPaths(db, userId, req.params.name),
    });
    res.json({ ok: true, id: checkpoint.id, application });
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

  // §7 orphan RUN → Spec 편입/분리. specId:null이면 분리(미분류). task 잠금과 달리 RUN은
  // 재편입을 허용한다 — 나중에 "이건 저 Spec 일이었다"고 재분류하는 게 정상 흐름이다.
  router.post("/:name/roadmap/run-spec", validateBody(runSpecSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const result = await assignRunToSpec(db, userId, req.params.name, req.body.runId, req.body.specId ?? null);
    if (!result.ok) {
      const status = result.errorCode === "NODE_NOT_FOUND" ? 404 : 409;
      res.status(status).json({ ok: false, errorCode: result.errorCode, message: result.message });
      return;
    }
    res.json({ ok: true });
  });

  // §7 폐기/복구. 삭제가 아니라 manual_status='dropped' override라 되돌릴 수 있다.
  // 완료 항목이 하위에 있으면 409 — 이미 한 일을 "없던 일"로 만들지 않는다.
  router.post("/:name/roadmap/drop", validateBody(manualStatusClearSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const result = await dropSubtree(db, userId, req.params.name, req.body.nodeId, userId);
    if (!result.ok) {
      const status = result.errorCode === "NODE_NOT_FOUND" ? 404 : 409;
      res.status(status).json({ ok: false, errorCode: result.errorCode, message: result.message });
      return;
    }
    res.json({ ok: true, affected: result.affected });
  });

  router.post("/:name/roadmap/restore", validateBody(manualStatusClearSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const result = await restoreSubtree(db, userId, req.params.name, req.body.nodeId);
    if (!result.ok) {
      res.status(404).json({ ok: false, errorCode: result.errorCode, message: result.message });
      return;
    }
    res.json({ ok: true, affected: result.affected });
  });

  router.post("/:name/roadmap/position", validateBody(positionSchema), async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await setRoadmapPosition(db, userId, req.params.name, req.body.nodeId, req.body.x, req.body.y);
    res.json({ ok: true });
  });

  return router;
}
