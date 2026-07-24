import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { deriveUserId, type VerifyJwt } from "../auth/jwt.js";
import type { OidcTokenClient } from "../auth/oidcTokenClient.js";
import { validateBody } from "../schemas/validate.js";
import { syncUser } from "../services/syncService.js";

const tokenSchema = z.object({ code: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export interface AuthRouterConfig {
  authEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

// §8: GET /config PUBLIC, POST /token+/verify+/refresh exchange/verify a
// bearer/id token. requireAuth (auth/requireAuth.ts) is what actually gates
// bitbucket/pr routes - these endpoints themselves are PUBLIC per §3.6.
export function createAuthRouter(
  db: DbClient,
  oidcConfig: AuthRouterConfig,
  oidcClient: OidcTokenClient,
  verifyJwt: VerifyJwt
): Router {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json({
      authEndpoint: oidcConfig.authEndpoint,
      clientId: oidcConfig.clientId,
      redirectUri: oidcConfig.redirectUri,
      scope: oidcConfig.scope,
    });
  });

  router.post("/token", validateBody(tokenSchema), async (req, res) => {
    try {
      const tokens = await oidcClient.exchangeCode(req.body.code);
      const claims = await verifyJwt(tokens.idToken);
      const userId = deriveUserId(claims);
      await syncUser(db, { userId, displayName: typeof claims.name === "string" ? claims.name : undefined });
      res.json({
        user: { id: userId },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
      });
    } catch {
      res.status(401).json({ error: "token_exchange_failed" });
    }
  });

  router.post("/verify", async (req, res) => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const claims = await verifyJwt(match[1]);
      res.json({ user: { id: deriveUserId(claims) } });
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  });

  router.post("/refresh", validateBody(refreshSchema), async (req, res) => {
    try {
      const tokens = await oidcClient.refresh(req.body.refreshToken);
      const claims = await verifyJwt(tokens.idToken);
      const userId = deriveUserId(claims);
      res.json({
        user: { id: userId },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? req.body.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
      });
    } catch {
      res.status(401).json({ error: "refresh_failed" });
    }
  });

  return router;
}
