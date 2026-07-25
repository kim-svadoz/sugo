import type { NextFunction, Request, Response } from "express";
import type { DbClient } from "../db/client.js";
import { resolveUserIdByToken } from "../services/apiTokenService.js";

// SaaS(공개 배포) 전용: 플러그인이 보낸 Bearer API 토큰으로 신원을 확정한다.
// body/query의 userId는 무시하고 오직 토큰이 가리키는 user_id만 req.userId로 세운다.
// → 멀티테넌트 격리를 서버가 강제(외부 무신뢰 사용자가 남의 userId를 사칭 불가).
export function requireApiAuth(db: DbClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) {
      res.status(401).json({ error: "unauthorized", message: "API token required (Authorization: Bearer)" });
      return;
    }
    const userId = await resolveUserIdByToken(db, match[1].trim());
    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "invalid API token" });
      return;
    }
    req.userId = userId;
    next();
  };
}

/**
 * 논블로킹 변형: 토큰이 있으면 신원을 세우고, 없거나 틀려도 막지 않고 통과시킨다.
 * sync 수신처럼 "플러그인을 절대 블로킹하지 않는다"(§3.1)를 유지하되, 유효 토큰이 있으면
 * req.userId를 신뢰 신원으로 채운다. 라우트는 req.userId 유무로 저장/드롭을 결정한다.
 * ※ 공개 SaaS에서는 requireApiAuth(강제)를 쓰고, 이 변형은 과도기/특수 용도로만.
 */
export function optionalApiAuth(db: DbClient) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (match) {
      const userId = await resolveUserIdByToken(db, match[1].trim());
      if (userId) req.userId = userId;
    }
    next();
  };
}
