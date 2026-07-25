import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// SaaS(공개 배포) 전용 개인 API 토큰. 플러그인이 sync 시 Authorization: Bearer로 보낸다.
// 평문 토큰은 발급 순간 딱 한 번만 사용자에게 노출하고, 서버는 sha256 해시만 저장·대조한다.
const TOKEN_PREFIX = "sugo_pat_";

export interface GeneratedApiToken {
  /** 사용자에게 한 번만 보여주는 평문 토큰 */
  token: string;
  /** DB에 저장하는 sha256 hex(64자) */
  hash: string;
  /** 목록 표시용 뒷자리 힌트 */
  hint: string;
}

/** sha256 hex. 토큰 저장/대조 양쪽에서 동일하게 쓴다. */
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 새 토큰 발급. 평문은 반환값에만 있고 어디에도 저장하지 않는다. */
export function generateApiToken(): GeneratedApiToken {
  const raw = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  return { token: raw, hash: hashApiToken(raw), hint: raw.slice(-6) };
}

/** 형식이 우리 토큰인지 가벼운 검사(무의미한 값으로 DB 조회하는 것 방지). */
export function looksLikeApiToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.length >= TOKEN_PREFIX.length + 16;
}

/** 타이밍 안전 해시 비교(DB 대조는 인덱스로 하지만, 상수시간 비교가 필요한 곳을 위해 제공). */
export function safeHashEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
