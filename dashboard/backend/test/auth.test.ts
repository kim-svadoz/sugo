import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { createJwtVerifier } from "../src/auth/jwt.js";
import type { OidcTokenClient, TokenResponse } from "../src/auth/oidcTokenClient.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

// No real IdP is reachable from this environment, so tests sign their own
// tokens with a local keypair and hand the verifier a local JWKS built from
// the matching public key - same jose APIs the production path uses, just
// with createLocalJWKSet instead of createRemoteJWKSet.
async function testIdentity() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const verifyJwt = createJwtVerifier(jwks, "https://issuer.test");

  async function sign(claims: Record<string, unknown>) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://issuer.test")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  return { verifyJwt, sign };
}

class FakeOidcClient implements OidcTokenClient {
  constructor(private idToken: string) {}
  async exchangeCode(code: string): Promise<TokenResponse> {
    if (code !== "valid-code") throw new Error("invalid code");
    return { accessToken: "access-1", refreshToken: "refresh-1", idToken: this.idToken, expiresIn: 3600 };
  }
  async refresh(refreshToken: string): Promise<TokenResponse> {
    if (refreshToken !== "refresh-1") throw new Error("invalid refresh token");
    return { accessToken: "access-2", refreshToken: "refresh-2", idToken: this.idToken, expiresIn: 3600 };
  }
}

async function freshApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { verifyJwt, sign } = await testIdentity();
  const idToken = await sign({ account_id: "u1", name: "Kim" });
  const oidcClient = new FakeOidcClient(idToken);
  const { app } = await createApp({ db, verifyJwt, oidcClient });
  return { app, db, verifyJwt, sign, idToken };
}

describe("GET /api/auth/config", () => {
  it("returns the public OIDC client config (no secret)", async () => {
    const { app } = await freshApp();
    const res = await request(app).get("/api/auth/config").expect(200);
    expect(res.body).toHaveProperty("authEndpoint");
    expect(res.body).toHaveProperty("clientId");
    expect(res.body).toHaveProperty("redirectUri");
    expect(res.body).toHaveProperty("scope");
    expect(res.body).not.toHaveProperty("clientSecret");
  });
});

describe("POST /api/auth/token", () => {
  it("exchanges a valid code for tokens and upserts the user", async () => {
    const { app, db, idToken } = await freshApp();
    const res = await request(app).post("/api/auth/token").send({ code: "valid-code" }).expect(200);
    expect(res.body.user).toEqual({ id: "u1" });
    // accessToken은 이제 id_token(JWT) — IdP의 opaque access token 문제를 피하려 id_token을 Bearer로
    // 준다(실제 OIDC provider e2e에서 발견). fake의 idToken이 그대로 accessToken으로 나온다.
    expect(res.body.accessToken).toBe(idToken);
    expect(res.body.refreshToken).toBe("refresh-1");
    expect(typeof res.body.expiresAt).toBe("number");
    // 반환된 accessToken이 실제로 requireAuth를 통과하는 JWT인지 왕복 검증
    const verify = await request(app).post("/api/auth/verify").set("Authorization", `Bearer ${res.body.accessToken}`).expect(200);
    expect(verify.body.user).toEqual({ id: "u1" });

    const rows = await db.query("SELECT id, display_name FROM sugo_users WHERE id='u1'");
    expect(rows).toEqual([{ id: "u1", display_name: "Kim" }]);
  });

  it("401s on an invalid code", async () => {
    const { app } = await freshApp();
    await request(app).post("/api/auth/token").send({ code: "bad-code" }).expect(401);
  });

  it("400s on missing code", async () => {
    const { app } = await freshApp();
    await request(app).post("/api/auth/token").send({}).expect(400);
  });
});

describe("POST /api/auth/verify", () => {
  it("verifies a valid bearer token and returns the derived user", async () => {
    const { app, sign } = await freshApp();
    const token = await sign({ account_id: "u1" });
    const res = await request(app).post("/api/auth/verify").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ user: { id: "u1" } });
  });

  it("401s without a bearer header", async () => {
    const { app } = await freshApp();
    await request(app).post("/api/auth/verify").expect(401);
  });

  it("401s on a garbage token", async () => {
    const { app } = await freshApp();
    await request(app).post("/api/auth/verify").set("Authorization", "Bearer not-a-real-jwt").expect(401);
  });

  it("derives userId from preferred_username when account_id is absent", async () => {
    const { app, sign } = await freshApp();
    const token = await sign({ preferred_username: "kim@example.com" });
    const res = await request(app).post("/api/auth/verify").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ user: { id: "kim" } });
  });
});

describe("POST /api/auth/refresh", () => {
  it("exchanges a valid refresh token for new tokens", async () => {
    const { app, idToken } = await freshApp();
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "refresh-1" }).expect(200);
    expect(res.body.accessToken).toBe(idToken); // id_token(JWT)을 Bearer로 반환
    expect(res.body.refreshToken).toBe("refresh-2");
  });

  it("401s on an invalid refresh token", async () => {
    const { app } = await freshApp();
    await request(app).post("/api/auth/refresh").send({ refreshToken: "garbage" }).expect(401);
  });
});

describe("requireAuth middleware (via a throwaway protected route)", () => {
  it("rejects unconfigured OIDC (no override) with a clear error, not a silent pass", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db); // no auth overrides - simulates unconfigured env
    // /api/auth/verify itself is PUBLIC but still needs a working verifier;
    // with OIDC unconfigured it must fail closed rather than accept anything.
    await request(app).post("/api/auth/verify").set("Authorization", "Bearer anything").expect(401);
  });
});
