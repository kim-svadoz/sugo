import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { requireSession } from "../auth/session.js";
import { createApiToken, listApiTokens, revokeApiToken } from "../services/apiTokenService.js";

const createSchema = z.object({ name: z.string().max(191).optional() });

// 공개 SaaS(§Phase 1) API 토큰 관리(웹 세션 필요). 사용자가 여기서 발급한 토큰을 플러그인
// DashboardConfig.apiToken에 붙여넣고, 플러그인은 sync 시 Bearer로 보낸다.
export function createTokensRouter(db: DbClient, sessionSecret: string): Router {
  const router = Router();
  router.use(requireSession(sessionSecret));

  // 발급 — 평문 토큰은 이 응답에서만 딱 한 번.
  router.post("/", async (req, res) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const created = await createApiToken(db, req.userId!, parsed.data.name ?? null);
    res.status(201).json(created);
  });

  // 목록 — 힌트만(평문/해시 없음).
  router.get("/", async (req, res) => {
    res.json({ tokens: await listApiTokens(db, req.userId!) });
  });

  // 폐기 — 본인 것만.
  router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    res.json({ revoked: await revokeApiToken(db, req.userId!, id) });
  });

  return router;
}
