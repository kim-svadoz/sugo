import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireUser } from "../auth/requireUser.js";
import { getCalibratedRatio } from "../services/statsService.js";

// Stats/Metrics (PUBLIC). `/api/stats` + alias `/api/metrics`. usage/daily/trends는
// 아직 미구현이라 0/빈값을 반환한다(목데이터를 만들지 않는다). calibrated-ratio만 실측(statsService).
export function createStatsRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret)); // 공개 SaaS: 세션 또는 API 토큰 신원 강제

  router.get(
    "/calibrated-ratio",
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const ratio = await getCalibratedRatio(db, userId);
      // 플러그인 fetchCalibratedRatio는 {ratio:number}를 기대한다. 실측 부족(null)이면 ratio를
      // 빼서 플러그인이 고정 기본값으로 폴백하게 한다(result?.ratio ?? null).
      res.json(ratio === null ? { ratio: null } : { ratio });
    }),
  );

  // 미구현 통계 — 0/빈값(stub). 가짜 데이터 금지.
  router.get("/usage", (_req, res) => res.json({ totalSessions: 0, totalTasks: 0, totalCommits: 0 }));
  router.get("/daily", (_req, res) => res.json({ days: [] }));
  router.get("/trends", (_req, res) => res.json({ trends: [] }));

  return router;
}
