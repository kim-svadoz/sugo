import { jwtVerify, type JWTVerifyGetKey } from "jose";

export interface JwtClaims {
  sub?: string;
  account_id?: string;
  preferred_username?: string;
  [key: string]: unknown;
}

export type VerifyJwt = (token: string) => Promise<JwtClaims>;

// §8: RS256/JWKS verification. `getKey` is injected (createRemoteJWKSet for
// production, createLocalJWKSet for tests) so this never needs a real IdP
// reachable over the network to be exercised.
export function createJwtVerifier(getKey: JWTVerifyGetKey, issuer?: string): VerifyJwt {
  return async (token: string) => {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: issuer || undefined,
    });
    return payload as JwtClaims;
  };
}

// §8: userId = account_id || preferred_username.split('@')[0]
export function deriveUserId(claims: JwtClaims): string {
  if (claims.account_id) return claims.account_id;
  if (claims.preferred_username) return claims.preferred_username.split("@")[0];
  if (claims.sub) return claims.sub;
  throw new Error("cannot derive userId from token claims");
}
