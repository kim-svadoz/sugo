import { homedir } from "node:os";
import { join } from "node:path";

// Environment variables. DB_DRIVER lets local dev
// run against SQLite — production always sets DB_DRIVER=mysql (or leaves it
// unset, which is the default).
export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3001),
  dbDriver: (process.env.DB_DRIVER ?? "mysql") as "mysql" | "sqlite",
  sqliteFile: process.env.SQLITE_FILE ?? ":memory:",
  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "sugo_dashboard",
  },
  pluginVersion: process.env.PLUGIN_VERSION ?? "0.0.0",
  secretEncKey: process.env.SECRET_ENC_KEY ?? "",
  // 미리 만들어 둔 하네스/스킬 디렉터리 경로(harness/skills 서빙에 쓴다).
  // 미설정이면 빈 매니페스트/404로 안전 반환한다(가짜 데이터 금지).
  harnessPath: process.env.HARNESS_PATH ?? "",
  harnessOverridePath: process.env.HARNESS_OVERRIDE_PATH ?? join(homedir(), ".claude", "sugo", "harness-overrides"),
  skillsPath: process.env.SKILLS_PATH ?? "",
  // 설정되면 빌드된 프론트 정적 파일을 같은 프로세스·포트에서 서빙한다. 개발(vite dev)은 비워 둔다.
  staticDir: process.env.DASHBOARD_STATIC_DIR ?? "",
  // Schedule SPEC에 붙여 넣은 기획 화면 이미지. spec-writer가 읽어 spec.md 버전 디렉터리로 복사한다.
  specAttachmentsPath: process.env.SPEC_ATTACHMENTS_PATH ?? join(homedir(), ".sugo-dashboard", "spec-attachments"),
  awsGuardPolicyPath: process.env.SUGO_AWS_GUARD_POLICY_PATH ?? join(homedir(), ".claude", "sugo", "aws-readonly-policy.json"),
  integrationFeaturesPath: process.env.SUGO_INTEGRATION_FEATURES_PATH ?? join(homedir(), ".claude", "sugo", "integration-features.json"),
  harnessFeaturePath: process.env.SUGO_HARNESS_FEATURE_PATH ?? join(homedir(), ".claude", "sugo", "harness-feature.json"),
  // cors()를 옵션 없이 열어두지 않는다 — 화이트리스트만 허용.
  // CORS_ORIGINS는 콤마 구분이고, 기본값은 로컬 개발용 Vite dev 서버 포트다.
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5175").split(",").map((s) => s.trim()).filter(Boolean),
  oidc: {
    issuer: process.env.OIDC_ISSUER ?? "",
    authEndpoint: process.env.OIDC_AUTH_ENDPOINT ?? "",
    tokenEndpoint: process.env.OIDC_TOKEN_ENDPOINT ?? "",
    jwksUri: process.env.OIDC_JWKS_URI ?? "",
    clientId: process.env.OIDC_CLIENT_ID ?? "",
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
    redirectUri: process.env.OIDC_REDIRECT_URI ?? "",
    scope: "openid profile email offline_access",
  },
  // GitHub OAuth 웹 로그인 + HS256 세션. OIDC와 별개 경로.
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    redirectUri: process.env.GITHUB_REDIRECT_URI ?? "",
    scope: process.env.GITHUB_SCOPE ?? "read:user",
  },
  // 세션/state 서명용 대칭키(HS256). 프로덕션은 반드시 강한 랜덤값을 시크릿 매니저로 주입.
  sessionSecret: process.env.SESSION_SECRET ?? "",
  // 로그인 성공 후 세션 토큰을 붙여 리다이렉트할 프론트 URL.
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5175",
  // 개인용 로컬 실행에서만 OAuth를 우회한다. 기본 off라 production 동작에는 영향이 없다.
  localDev: {
    enabled: process.env.LOCAL_DEV_MODE === "1",
    userId: process.env.LOCAL_DEV_USER_ID ?? "local-dev",
    displayName: process.env.LOCAL_DEV_DISPLAY_NAME ?? "Local Developer",
  },
};
