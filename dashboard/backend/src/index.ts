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
import { createJwtVerifier, type VerifyJwt } from "./auth/jwt.js";
import { createHttpOidcTokenClient, type OidcTokenClient } from "./auth/oidcTokenClient.js";

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

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: pkg.version, build: process.env.BUILD_ID ?? "dev" });
  });

  app.use("/api/sync", createSyncRouter(db));
  app.use("/api/activity", createActivityRouter(db));
  app.use("/api/workspaces", createWorkspacesRouter(db));
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

  return { app, db, verifyJwt };
}

async function main() {
  const { app } = await createApp();
  app.listen(config.port, () => {
    console.log(`sugo-dashboard-backend listening on :${config.port} (db=${config.dbDriver})`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
