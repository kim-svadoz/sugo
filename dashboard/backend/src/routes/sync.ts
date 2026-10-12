import { Router } from "express";
import type { DbClient } from "../db/client.js";
import {
  bulkSyncSchema,
  checkpointSchema,
  decisionSchema,
  entityDeleteSchema,
  historySchema,
  pluginVersionSchema,
  roadmapSyncSchema,
  reviewArtifactSchema,
  taskSchema,
  workspaceDeleteSchema,
  workspaceMetaSchema,
  workspaceSchema,
  userSchema,
} from "../schemas/sync.js";
import { z } from "zod";
import { validateBody } from "../schemas/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { syncSchemaVersion } from "../middleware/syncSchemaVersion.js";
import { requireUser } from "../auth/requireUser.js";
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
import { saveReviewArtifact } from "../services/reviewArtifacts.js";
import { linkRoadmapNodes, unlinkRoadmapNodes } from "../services/workspaceService.js";

const roadmapLinkSchema = z.object({
  userId: z.string().min(1),
  workspaceName: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
});

// 공개 SaaS(§Phase 1, 스펙 §3.1 이탈): 토큰 인증 강제. body/query의 userId는 신뢰하지 않고
// 인증 미들웨어가 세운 req.userId로 덮어써서(bindUserId) 모든 핸들러가 토큰 신원만 쓰게 한다.
export function createSyncRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  // §3.1 계약 버전 소비는 인증보다 앞이든 뒤든 상관없지만, 인증 뒤에 둬서 미인증 요청까지
  // 버전 경고를 찍지 않게 한다(로그 오염 방지).
  router.use(requireUser(db, sessionSecret));
  router.use(syncSchemaVersion());
  // 단일 엔티티 핸들러 일괄 강제: 요청 본문의 userId를 토큰 신원으로 덮어쓴다.
  router.use((req, _res, next) => {
    if (req.body && typeof req.body === "object") (req.body as { userId?: string }).userId = req.userId;
    next();
  });

  router.get("/plugin-version", asyncHandler(async (req, res) => {
    const userId = req.userId!;
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
    await deleteWorkspace(db, req.body.userId, req.body.name, { purge: req.body.purge === true });
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

  router.post("/roadmap", validateBody(roadmapSyncSchema), asyncHandler(async (req, res) => {
    await syncRoadmap(db, req.body.userId, req.body.workspaceName, req.body.nodes);
    res.json({ ok: true });
  }));

  router.post("/review-artifact", validateBody(reviewArtifactSchema), asyncHandler(async (req, res) => {
    const { userId: _ignored, ...artifact } = req.body;
    await saveReviewArtifact(db, req.userId!, artifact);
    res.json({ ok: true });
  }));

  // §7.2 "POST /api/sync/roadmap/link + DELETE (링크 편집 전파)": 플러그인이 로컬에서 편집한
  // 링크를 push한다. 스냅샷 replace와 별개 신호 — dependsOn 편집 의도를 그대로 적용한다
  // (fail-closed task↔task + 사이클 가드는 workspaceService가 이미 담당). 논블로킹이라 결과 상관없이 200.
  router.post("/roadmap/link", validateBody(roadmapLinkSchema), asyncHandler(async (req, res) => {
    await linkRoadmapNodes(db, req.body.userId, req.body.workspaceName, req.body.fromId, req.body.toId);
    res.json({ ok: true });
  }));

  router.delete("/roadmap/link", validateBody(roadmapLinkSchema), asyncHandler(async (req, res) => {
    await unlinkRoadmapNodes(db, req.body.userId, req.body.workspaceName, req.body.fromId, req.body.toId);
    res.json({ ok: true });
  }));

  router.post("/bulk", validateBody(bulkSyncSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof bulkSyncSchema>;
    const uid = req.userId!; // 배치 각 항목의 userId도 토큰 신원으로 강제(항목별 사칭 차단)
    for (const u of body.users ?? []) await syncUser(db, { ...u, userId: uid });
    for (const w of body.workspaces ?? []) await syncWorkspace(db, { ...w, userId: uid });
    for (const t of body.tasks ?? []) await syncTask(db, { ...t, userId: uid });
    for (const h of body.history ?? []) await syncHistory(db, { ...h, userId: uid });
    for (const d of body.decisions ?? []) await syncDecision(db, { ...d, userId: uid });
    for (const c of body.checkpoints ?? []) await syncCheckpoint(db, { ...c, userId: uid });
    for (const m of body.workspaceMeta ?? []) await syncWorkspaceMeta(db, { ...m, userId: uid });
    for (const r of body.roadmap ?? []) await syncRoadmap(db, uid, r.workspaceName, r.nodes);
    res.json({ ok: true });
  }));

  return router;
}
