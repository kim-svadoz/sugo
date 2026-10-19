import type { NextFunction, Request, Response } from "express";
import type { DbClient } from "../db/client.js";
import { resolveUserIdByToken } from "../services/apiTokenService.js";
import { verifySession } from "./session.js";

// 공개 SaaS: 데이터 라우트는 두 종류의 신원을 모두 받는다.
//  - 브라우저(웹UI): GitHub 로그인으로 받은 세션 JWT
//  - 플러그인/CLI: 웹UI에서 발급한 API 토큰(sugo_pat_...)
// 어느 쪽이든 req.userId로 해석하고, body/query의 userId는 신뢰하지 않는다.
// 토큰 형태로 분기: sugo_pat_ 접두사면 API 토큰, 아니면 세션 JWT로 검증.
export function requireUser(db: DbClient, sessionSecret: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (!match) {
      res.status(401).json({ error: "unauthorized", message: "session or API token required" });
      return;
    }
    const token = match[1].trim();
    let userId: string | null = null;
    if (token.startsWith("sugo_pat_")) {
      userId = await resolveUserIdByToken(db, token);
    } else {
      try {
        userId = await verifySession(token, sessionSecret);
      } catch {
        userId = null;
      }
    }
    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "invalid or expired credential" });
      return;
    }
    req.userId = userId;
    next();
  };
}
