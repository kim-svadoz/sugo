import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { createRemoteJWKSet } from "jose";
import { config } from "./config.js";
import { initDb, type InitDbOptions } from "./db/init.js";
import type { DbClient } from "./db/client.js";
import { createSyncRouter } from "./routes/sync.js";
import { createActivityRouter } from "./routes/activity.js";
import { createWorkspacesRouter } from "./routes/workspaces.js";
import { createScheduleRouter } from "./routes/schedule.js";
import { createNewsRouter } from "./routes/news.js";
import { createProfileRouter } from "./routes/profile.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBitbucketRouter } from "./routes/bitbucket.js";
import { createGitConnectionsRouter } from "./routes/gitConnections.js";
import { createAwsContextRouter } from "./routes/awsContext.js";
import { createPrRouter } from "./routes/pr.js";
import { createStatsRouter } from "./routes/stats.js";
import { createWeeklyReportsRouter } from "./routes/weeklyReports.js";
import { createHarnessRouter, createSkillsRouter } from "./routes/harness.js";
import { createGithubAuthRouter } from "./routes/githubAuth.js";
import { createTokensRouter } from "./routes/tokens.js";
import { createLocalAuthRouter, type LocalAuthConfig } from "./routes/localAuth.js";
import { createHttpGithubOAuth, type GithubOAuthClient } from "./auth/github.js";
import { createJwtVerifier, type VerifyJwt } from "./auth/jwt.js";
import { createHttpOidcTokenClient, type OidcTokenClient } from "./auth/oidcTokenClient.js";
import { createHttpBitbucketClient, type BitbucketClient } from "./bitbucket/client.js";
import { adaptBitbucketClient, type GitProviderClients } from "./git/clients.js";
import { createHttpGithubClient, createHttpGitlabClient } from "./git/httpClients.js";
import { createAwsCodeCommitClient } from "./git/codeCommitClient.js";
import { createAwsCliContextClient, type AwsContextClient } from "./aws/contextClient.js";
import { createHttpPinpointClient, type PinpointClient } from "./pinpoint/client.js";
import { createPinpointContextRouter } from "./routes/pinpointContext.js";
import { createProjectIntegrationsRouter } from './routes/projectIntegrations.js';
import type { ProjectRegistrar } from './services/projectRegistrar.js';
import { createAwsGuardPolicyRouter } from './routes/awsGuardPolicy.js';
import { corsWhitelist } from "./middleware/cors.js";
import { errorMiddleware } from "./middleware/asyncHandler.js";
import { startContextAutoRefresh } from "./services/contextAutoRefreshService.js";
import { createWeeklySettingsService, type WeeklySettingsService } from "./services/weeklySettingsService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 번들은 빌드 때 DASHBOARD_VERSION을 상수로 박는다(옆 디렉터리의 package.json은 플러그인 것이다).
const pkg: { version: string } = process.env.DASHBOARD_VERSION
  ? { version: process.env.DASHBOARD_VERSION }
  : JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

// IdP가 설정되지 않았을 때의 기본 구현. 오버라이드 없이 여기까지 도달한 요청은 설정
// 실수이므로, 검증 안 된 토큰을 조용히 받아들이는 대신 시끄럽게 fail-closed 한다.
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
  gitProviderClients?: Partial<GitProviderClients>;
  awsContextClient?: AwsContextClient;
  pinpointClient?: PinpointClient;
  githubOAuth?: GithubOAuthClient;
  sessionSecret?: string;
  secretEncKey?: string;
  frontendUrl?: string;
  localDev?: LocalAuthConfig;
  harnessPath?: string;
  harnessOverridePath?: string;
  skillsPath?: string;
  specAttachmentsPath?: string;
  awsGuardPolicyPath?: string;
  staticDir?: string;
  sqliteSchema?: InitDbOptions["sqliteSchema"];
  weeklySettingsService?: WeeklySettingsService;
  projectRegistrar?: ProjectRegistrar;
}

export async function createApp(dbOverrideOrOptions?: DbClient | AppOverrides) {
  const overrides: AppOverrides =
    dbOverrideOrOptions && "query" in dbOverrideOrOptions ? { db: dbOverrideOrOptions } : (dbOverrideOrOptions ?? {});

  const db = overrides.db ?? (await initDb({ sqliteSchema: overrides.sqliteSchema }));
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
  const gitProviderClients: GitProviderClients = {
    github: overrides.gitProviderClients?.github ?? createHttpGithubClient(),
    gitlab: overrides.gitProviderClients?.gitlab ?? createHttpGitlabClient(),
    bitbucket_server: overrides.gitProviderClients?.bitbucket_server ?? adaptBitbucketClient(bitbucketClient),
    aws_codecommit: overrides.gitProviderClients?.aws_codecommit ?? createAwsCodeCommitClient(),
  };
  const awsContextClient = overrides.awsContextClient ?? createAwsCliContextClient();
  const pinpointClient = overrides.pinpointClient ?? createHttpPinpointClient();
  const githubOAuth = overrides.githubOAuth ?? createHttpGithubOAuth(config.github);
  const sessionSecret = overrides.sessionSecret ?? config.sessionSecret;
  const secretEncKey = overrides.secretEncKey ?? config.secretEncKey;
  const frontendUrl = overrides.frontendUrl ?? config.frontendUrl;
  const localDev = overrides.localDev ?? config.localDev;
  const harnessPath = overrides.harnessPath ?? config.harnessPath;
  const harnessOverridePath = overrides.harnessOverridePath ?? config.harnessOverridePath;
  const skillsPath = overrides.skillsPath ?? config.skillsPath;
  const specAttachmentsPath = overrides.specAttachmentsPath ?? config.specAttachmentsPath;
  const awsGuardPolicyPath = overrides.awsGuardPolicyPath ?? config.awsGuardPolicyPath;
  const weeklySettingsService = overrides.weeklySettingsService ?? createWeeklySettingsService();

  const app = express();
  app.use(corsWhitelist(config.corsOrigins));
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: pkg.version, build: process.env.BUILD_ID ?? "dev" });
  });
  app.use("/api/news", createNewsRouter());
  app.use("/api/profile", createProfileRouter(db, sessionSecret));

  app.use("/api/sync", createSyncRouter(db, sessionSecret));
  app.use("/api/activity", createActivityRouter(db, sessionSecret));
  app.use("/api/workspaces", createWorkspacesRouter(db, sessionSecret, specAttachmentsPath));
  app.use("/api/schedule", createScheduleRouter(db, sessionSecret));
  // GitHub OAuth 로그인 + API 토큰 관리. OIDC /api/auth보다 먼저 등록.
  app.use("/api/auth/github", createGithubAuthRouter(db, githubOAuth, config.github, sessionSecret, config.frontendUrl));
  if (localDev.enabled) app.use("/api/auth/local", createLocalAuthRouter(db, sessionSecret, frontendUrl, localDev));
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
  app.use("/api/git-connections", createGitConnectionsRouter(db, sessionSecret, secretEncKey));
  app.use("/api/aws-context", createAwsContextRouter(db, sessionSecret, awsContextClient));
  app.use("/api/aws-guard-policy", createAwsGuardPolicyRouter(db, sessionSecret, awsGuardPolicyPath));
  app.use("/api/pinpoint-context", createPinpointContextRouter(db, sessionSecret, pinpointClient));
  app.use('/api/project-integrations', createProjectIntegrationsRouter(db, sessionSecret, overrides.projectRegistrar));
  app.use("/api/pr", createPrRouter(db, sessionSecret, secretEncKey, gitProviderClients));
  // /api/stats + alias /api/metrics(플러그인이 calibrated-ratio를 여기로 fetch), harness, skills.
  const statsRouter = createStatsRouter(db, sessionSecret);
  app.use("/api/stats", statsRouter);
  app.use("/api/metrics", statsRouter);
  app.use("/api/weekly/reports", createWeeklyReportsRouter(db, sessionSecret, weeklySettingsService));
  app.use("/api/harness", createHarnessRouter(harnessPath, harnessOverridePath, db, sessionSecret));
  app.use("/api/skills", createSkillsRouter(skillsPath));

  const staticDir = overrides.staticDir ?? config.staticDir;
  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA 라우트(/sessions 등) 새로고침이 404가 되지 않게 API가 아닌 GET은 index.html로 돌려준다.
    app.get(/^\/(?!api\/|health$).*/, (_req, res) => {
      res.sendFile(join(staticDir, "index.html"));
    });
  }

  // 모든 라우트 뒤: 동기 throw / next(err)를 프로세스를 죽이지 않고 500으로 응답한다.
  app.use(errorMiddleware);

  return { app, db, verifyJwt, awsContextClient, pinpointClient };
}

async function main() {
  // 회복력: sync는 논블로킹이고 대시보드 다운이 플러그인을 막으면 안 된다. Express 4는
  // async 핸들러 reject를 자동으로 안 잡아 unhandledRejection으로 프로세스가 죽을 수 있으므로,
  // 프로세스 레벨 가드로 잘못된 push 하나가 전체 서버를 내리는 걸 막는다. 로그만 남기고 계속 산다.
  process.on("unhandledRejection", (reason) => {
    console.error("[dashboard] unhandledRejection (프로세스 유지):", reason instanceof Error ? reason.message : reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[dashboard] uncaughtException (프로세스 유지):", err.message);
  });

  const { app, db, awsContextClient, pinpointClient } = await createApp();
  startContextAutoRefresh(db, awsContextClient, pinpointClient);
  app.listen(config.port, config.host, () => {
    console.log(`sugo-dashboard-backend listening on ${config.host}:${config.port} (db=${config.dbDriver})`);
  });
}

// 번들(standalone.ts)은 번들 파일이 곧 argv[1]이라 이 조건이 참이 된다 — 직접 listen하므로 끈다.
if (!process.env.SUGO_DASHBOARD_EMBEDDED && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
