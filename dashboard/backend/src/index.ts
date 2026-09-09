import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { createRemoteJWKSet } from "jose";
import { config } from "./config.js";
import { initDb } from "./db/init.js";
import type { DbClient } from "./db/client.js";
import { createSyncRouter } from "./routes/sync.js";
import { createActivityRouter } from "./routes/activity.js";
import { createWorkspacesRouter } from "./routes/workspaces.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBitbucketRouter } from "./routes/bitbucket.js";
import { createPrRouter } from "./routes/pr.js";
import { createStatsRouter } from "./routes/stats.js";
import { createHarnessRouter, createSkillsRouter } from "./routes/harness.js";
import { createGithubAuthRouter } from "./routes/githubAuth.js";
import { createTokensRouter } from "./routes/tokens.js";
import { createHttpGithubOAuth, type GithubOAuthClient } from "./auth/github.js";
import { createJwtVerifier, type VerifyJwt } from "./auth/jwt.js";
import { createHttpOidcTokenClient, type OidcTokenClient } from "./auth/oidcTokenClient.js";
import { createHttpBitbucketClient, type BitbucketClient } from "./bitbucket/client.js";
import { corsWhitelist } from "./middleware/cors.js";
import { errorMiddleware } from "./middleware/asyncHandler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

// No real IdP is configured in this local dev environment (§11 "OIDC
// IdP... -> 외부 IdP + Secret", remove) - a request that reaches these
// before an override is a misconfiguration, so they fail closed loudly
// instead of silently accepting unverified tokens.
function unconfiguredVerifyJwt(): VerifyJwt {
  return async () => {
    throw new Error("OIDC_JWKS_URI not configured");
  };
}
function unconfiguredOidcClient(): OidcTokenClient {
  return {
    exchangeCode: async () => {
      throw new Error("OIDC_TOKEN_ENDPOINT not configured");
    },
    refresh: async () => {
      throw new Error("OIDC_TOKEN_ENDPOINT not configured");
    },
  };
}

export interface AppOverrides {
  db?: DbClient;
  verifyJwt?: VerifyJwt;
  oidcClient?: OidcTokenClient;
  bitbucketClient?: BitbucketClient;
  githubOAuth?: GithubOAuthClient;
  sessionSecret?: string;
  secretEncKey?: string;
}

export async function createApp(dbOverrideOrOptions?: DbClient | AppOverrides) {
  const overrides: AppOverrides =
    dbOverrideOrOptions && "query" in dbOverrideOrOptions ? { db: dbOverrideOrOptions } : (dbOverrideOrOptions ?? {});

  const db = overrides.db ?? (await initDb());
  const verifyJwt =
    overrides.verifyJwt ?? (config.oidc.jwksUri ? createJwtVerifier(createRemoteJWKSet(new URL(config.oidc.jwksUri)), config.oidc.issuer) : unconfiguredVerifyJwt());
  const oidcClient =
    overrides.oidcClient ??
    (config.oidc.tokenEndpoint
      ? createHttpOidcTokenClient({
          tokenEndpoint: config.oidc.tokenEndpoint,
          clientId: config.oidc.clientId,
          clientSecret: config.oidc.clientSecret,
          redirectUri: config.oidc.redirectUri,
        })
      : unconfiguredOidcClient());
  const bitbucketClient = overrides.bitbucketClient ?? createHttpBitbucketClient();
  const githubOAuth = overrides.githubOAuth ?? createHttpGithubOAuth(config.github);
  const sessionSecret = overrides.sessionSecret ?? config.sessionSecret;
  const secretEncKey = overrides.secretEncKey ?? config.secretEncKey;

  const app = express();
  app.use(corsWhitelist(config.corsOrigins));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: pkg.version, build: process.env.BUILD_ID ?? "dev" });
  });

  app.use("/api/sync", createSyncRouter(db, sessionSecret));
  app.use("/api/activity", createActivityRouter(db, sessionSecret));
  app.use("/api/workspaces", createWorkspacesRouter(db, sessionSecret));
  // 공개 SaaS(§Phase 1): GitHub OAuth 로그인 + API 토큰 관리. 기존 OIDC /api/auth보다 먼저 등록.
  app.use("/api/auth/github", createGithubAuthRouter(db, githubOAuth, config.github, sessionSecret, config.frontendUrl));
  app.use("/api/tokens", createTokensRouter(db, sessionSecret));
  app.use(
    "/api/auth",
    createAuthRouter(
      db,
      {
        authEndpoint: config.oidc.authEndpoint,
        clientId: config.oidc.clientId,
        redirectUri: config.oidc.redirectUri,
        scope: config.oidc.scope,
      },
      oidcClient,
      verifyJwt
    )
  );
  app.use("/api/bitbucket", createBitbucketRouter(db, sessionSecret, secretEncKey));
  app.use("/api/pr", createPrRouter(db, sessionSecret, secretEncKey, bitbucketClient));
  // §3.7: /api/stats + alias /api/metrics(플러그인이 calibrated-ratio를 여기로 fetch), harness, skills.
  const statsRouter = createStatsRouter(db, sessionSecret);
  app.use("/api/stats", statsRouter);
  app.use("/api/metrics", statsRouter);
  app.use("/api/harness", createHarnessRouter(config.harnessPath));
  app.use("/api/skills", createSkillsRouter(config.skillsPath));

  // 모든 라우트 뒤: 동기 throw / next(err)를 프로세스를 죽이지 않고 500으로 응답한다.
  app.use(errorMiddleware);

  return { app, db, verifyJwt };
}

async function main() {
  // §3.1/§7 회복력: sync는 논블로킹이고 대시보드 다운이 플러그인을 막으면 안 된다. Express 4는
  // async 핸들러 reject를 자동으로 안 잡아 unhandledRejection으로 프로세스가 죽을 수 있으므로,
  // 프로세스 레벨 가드로 잘못된 push 하나가 전체 서버를 내리는 걸 막는다. 로그만 남기고 계속 산다.
  process.on("unhandledRejection", (reason) => {
    console.error("[dashboard] unhandledRejection (프로세스 유지):", reason instanceof Error ? reason.message : reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[dashboard] uncaughtException (프로세스 유지):", err.message);
  });

  const { app } = await createApp();
  app.listen(config.port, () => {
    console.log(`sugo-dashboard-backend listening on :${config.port} (db=${config.dbDriver})`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
