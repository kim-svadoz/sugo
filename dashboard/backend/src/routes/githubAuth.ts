import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { DbClient } from "../db/client.js";
import { syncUser } from "../services/syncService.js";
import {
  githubAuthorizeUrl,
  githubUserIdToUserId,
  type GithubOAuthClient,
  type GithubOAuthConfig,
} from "../auth/github.js";
import { issueSession, issueState, verifyState } from "../auth/session.js";

// 공개 SaaS(§Phase 1) GitHub OAuth 웹 로그인.
//   GET /api/auth/github/login    → GitHub 인가로 302
//   GET /api/auth/github/callback → code 교환·유저 프로비저닝·세션 발급 후 프론트로 302
export function createGithubAuthRouter(
  db: DbClient,
  github: GithubOAuthClient,
  cfg: GithubOAuthConfig,
  sessionSecret: string,
  frontendUrl: string
): Router {
  const router = Router();

  router.get("/login", async (_req, res) => {
    if (!cfg.clientId || !sessionSecret) {
      res.status(503).json({ error: "github_login_unconfigured" });
      return;
    }
    const state = await issueState(sessionSecret, randomUUID());
    res.redirect(githubAuthorizeUrl(cfg, state));
  });

  router.get("/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!code || !state) {
      res.status(400).json({ error: "missing_code_or_state" });
      return;
    }
    if (!(await verifyState(state, sessionSecret))) {
      res.status(400).json({ error: "invalid_state" });
      return;
    }
    try {
      const accessToken = await github.exchangeCode(code);
      const user = await github.fetchUser(accessToken);
      const userId = githubUserIdToUserId(user);
      await syncUser(db, { userId, displayName: user.name ?? user.login });
      const session = await issueSession(userId, sessionSecret);
      // 세션 토큰을 URL 프래그먼트로 전달(서버 로그·리퍼러에 안 남게). 프론트 /auth/callback 라우트가
      // 프래그먼트를 파싱해 저장한다(루트 '/'가 아니라 반드시 이 경로여야 파서가 동작).
      res.redirect(`${frontendUrl}/auth/callback#session=${encodeURIComponent(session)}`);
    } catch {
      res.status(401).json({ error: "github_oauth_failed" });
    }
  });

  return router;
}
