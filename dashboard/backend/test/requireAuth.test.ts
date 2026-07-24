import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { requireAuth } from "../src/auth/requireAuth.js";
import { createJwtVerifier } from "../src/auth/jwt.js";

async function testApp() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const verifyJwt = createJwtVerifier(jwks);

  const app = express();
  app.get("/protected", requireAuth(verifyJwt), (req, res) => {
    res.json({ userId: req.userId });
  });

  const token = await new SignJWT({ account_id: "u1" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  return { app, token };
}

describe("requireAuth middleware", () => {
  it("attaches req.userId and calls next() for a valid token", async () => {
    const { app, token } = await testApp();
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ userId: "u1" });
  });

  it("401s without an Authorization header", async () => {
    const { app } = await testApp();
    await request(app).get("/protected").expect(401);
  });

  it("401s on a malformed Authorization header (not 'Bearer <token>')", async () => {
    const { app, token } = await testApp();
    await request(app).get("/protected").set("Authorization", token).expect(401);
  });

  it("401s on an expired/invalid token", async () => {
    const { app } = await testApp();
    await request(app).get("/protected").set("Authorization", "Bearer garbage.garbage.garbage").expect(401);
  });
});
