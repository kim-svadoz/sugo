import { SignJWT, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";

// 공개 SaaS(§Phase 1) 웹 세션: GitHub 로그인 후 발급하는 HS256 JWT. 프론트가 이걸 Bearer로
// 들고 /api/tokens(토큰 관리)를 호출한다. OIDC(회사 IdP)와 무관한 독립 세션.
// state(CSRF)도 같은 대칭키로 서명한 단명 JWT로 처리해 stateless하게 유지한다.

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** 로그인 세션 발급(sub=userId). 기본 7일. */
export async function issueSession(userId: string, secret: string, ttlSeconds = 7 * 24 * 3600): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key(secret));
}

/** 세션 검증 → userId. 실패 시 throw. */
export async function verifySession(token: string, secret: string): Promise<string> {
  const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
  if (!payload.sub) throw new Error("session has no subject");
  return payload.sub;
}

/** OAuth CSRF state: nonce를 담은 단명(10분) 서명 토큰. */
export async function issueState(secret: string, nonce: string): Promise<string> {
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .sign(key(secret));
}

/** state 검증 → 유효하면 true. 서명/만료 불일치면 false(throw 안 함). */
export async function verifyState(token: string, secret: string): Promise<boolean> {
  try {
    await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

/** 웹 세션 강제 미들웨어(토큰 관리 라우트 보호). Bearer 세션 JWT → req.userId. */
export function requireSession(secret: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (!match) {
      res.status(401).json({ error: "unauthorized", message: "session required" });
      return;
    }
    try {
      req.userId = await verifySession(match[1].trim(), secret);
      next();
    } catch {
      res.status(401).json({ error: "unauthorized", message: "invalid or expired session" });
    }
  };
}
