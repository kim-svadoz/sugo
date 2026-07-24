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
};
