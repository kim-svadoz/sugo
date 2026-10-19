import type { DbClient } from "../db/client.js";
import { decryptSecret, encryptSecret } from "../security/secretBox.js";
import { upsertRow } from "../db/upsert.js";

export interface BitbucketTokenStatus {
  connected: boolean;
  hint: string | null;
  baseUrl: string | null;
  updatedAt: string | null;
}

// GET / — 상태만 {connected,hint,baseUrl,updatedAt}(토큰 반환 안 함).
export async function getBitbucketTokenStatus(db: DbClient, userId: string): Promise<BitbucketTokenStatus> {
  const rows = await db.query<{ token_hint: string; base_url: string | null; updated_at: string }>(
    "SELECT token_hint, base_url, updated_at FROM user_bitbucket_tokens WHERE user_id = ?",
    [userId]
  );
  if (rows.length === 0) return { connected: false, hint: null, baseUrl: null, updatedAt: null };
  const row = rows[0];
  return { connected: true, hint: row.token_hint, baseUrl: row.base_url, updatedAt: row.updated_at };
}

export async function setBitbucketToken(
  db: DbClient,
  userId: string,
  token: string,
  baseUrl: string | undefined,
  secretEncKey: string
): Promise<void> {
  const enc = encryptSecret(token, secretEncKey);
  const hint = token.slice(-4);
  await upsertRow(
    db,
    "user_bitbucket_tokens",
    { user_id: userId },
    { ct: enc.ct, iv: enc.iv, tag: enc.tag, base_url: baseUrl ?? null, token_hint: hint }
  );
}

export async function deleteBitbucketToken(db: DbClient, userId: string): Promise<void> {
  await db.exec("DELETE FROM user_bitbucket_tokens WHERE user_id = ?", [userId]);
}

// Only called server-side when actually making a Bitbucket API call
// (PR 호출 시에만 서버에서 복호화) - never exposed via a route response.
export async function getDecryptedBitbucketToken(
  db: DbClient,
  userId: string,
  secretEncKey: string
): Promise<{ token: string; baseUrl: string | null } | null> {
  const rows = await db.query<{ ct: string; iv: string; tag: string; base_url: string | null }>(
    "SELECT ct, iv, tag, base_url FROM user_bitbucket_tokens WHERE user_id = ?",
    [userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const token = decryptSecret({ ct: row.ct, iv: row.iv, tag: row.tag }, secretEncKey);
  return { token, baseUrl: row.base_url };
}
