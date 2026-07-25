import type { DbClient } from "../db/client.js";
import { generateApiToken, hashApiToken, looksLikeApiToken } from "../auth/apiToken.js";

export interface ApiTokenSummary {
  id: number;
  name: string | null;
  hint: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedApiToken {
  id: number;
  token: string; // 평문 — 이 응답에서만, 딱 한 번
  hint: string;
}

/** 새 API 토큰 발급. 평문은 반환값에만 담기고 DB엔 해시만 저장된다. */
export async function createApiToken(db: DbClient, userId: string, name: string | null): Promise<CreatedApiToken> {
  const { token, hash, hint } = generateApiToken();
  const result = await db.exec(
    "INSERT INTO user_api_tokens (user_id, name, token_hash, token_hint) VALUES (?, ?, ?, ?)",
    [userId, name, hash, hint]
  );
  return { id: Number(result.insertId), token, hint };
}

/**
 * 토큰으로 userId를 해석한다(핵심 격리 함수). 평문 토큰을 해시해 대조하고, 맞으면
 * last_used_at을 갱신한 뒤 userId를 반환한다. 없으면 null. body/query의 userId는
 * 절대 신뢰하지 않고 오직 이 함수의 결과만 신원으로 쓴다.
 */
export async function resolveUserIdByToken(db: DbClient, token: string): Promise<string | null> {
  if (!looksLikeApiToken(token)) return null;
  const hash = hashApiToken(token);
  const rows = await db.query<{ id: number; user_id: string }>(
    "SELECT id, user_id FROM user_api_tokens WHERE token_hash = ?",
    [hash]
  );
  if (rows.length === 0) return null;
  await db.exec("UPDATE user_api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?", [rows[0].id]);
  return rows[0].user_id;
}

/** 사용자의 토큰 목록(해시/평문 절대 미노출 — 힌트만). */
export async function listApiTokens(db: DbClient, userId: string): Promise<ApiTokenSummary[]> {
  const rows = await db.query<{
    id: number;
    name: string | null;
    token_hint: string | null;
    created_at: string;
    last_used_at: string | null;
  }>(
    "SELECT id, name, token_hint, created_at, last_used_at FROM user_api_tokens WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    hint: r.token_hint,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

/** 토큰 폐기. 본인 소유만 지운다(user_id 조건 필수). */
export async function revokeApiToken(db: DbClient, userId: string, id: number): Promise<boolean> {
  const result = await db.exec("DELETE FROM user_api_tokens WHERE user_id = ? AND id = ?", [userId, id]);
  return result.affectedRows > 0;
}
