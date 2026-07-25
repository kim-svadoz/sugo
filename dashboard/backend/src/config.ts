// Spec §8 "환경변수". DB_DRIVER is a local-only addition (not in the
// original) so local dev can run against SQLite until MySQL is available —
// production always sets DB_DRIVER=mysql (or leaves it unset, the default).
export const config = {
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
  // §9 CI가 빌드타임에 하네스 저장소를 클론해 구워두는 경로(§3.7 harness/skills 서빙 근거).
  // 로컬 로컬엔 없으므로 미설정이면 빈 매니페스트/404로 안전 반환(가짜 데이터 금지).
  harnessPath: process.env.HARNESS_PATH ?? "",
  skillsPath: process.env.SKILLS_PATH ?? "",
  // §8 "현재 냄새": original has cors() with no options (wide open). local
  // fix is a whitelist instead - CORS_ORIGINS is comma-separated, defaults to
  // the Vite dev server port for local frontend/backend development.
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean),
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
  // 공개 SaaS(§Phase 1): GitHub OAuth 웹 로그인 + HS256 세션. OIDC와 별개 경로.
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    redirectUri: process.env.GITHUB_REDIRECT_URI ?? "",
    scope: process.env.GITHUB_SCOPE ?? "read:user",
  },
  // 세션/state 서명용 대칭키(HS256). 프로덕션은 반드시 강한 랜덤값을 시크릿 매니저로 주입.
  sessionSecret: process.env.SESSION_SECRET ?? "",
  // 로그인 성공 후 세션 토큰을 붙여 리다이렉트할 프론트 URL.
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
};
