import type { DbClient } from "../db/client.js";
import { upsertRow } from "../db/upsert.js";
import { decryptSecret, encryptSecret } from "../security/secretBox.js";
import { deleteBitbucketToken, getBitbucketTokenStatus, getDecryptedBitbucketToken } from "./bitbucketTokenService.js";
import type { GitProviderConnection, GitProviderId } from "../git/provider.js";

export interface GitConnectionStatus {
  provider: GitProviderId;
  connected: boolean;
  hint: string | null;
  baseUrl: string | null;
  updatedAt: string | null;
  profile: string | null;
}

interface ConnectionRow {
  provider: GitProviderId;
  ct: string;
  iv: string;
  tag: string;
  base_url: string | null;
  token_hint: string | null;
  updated_at: string;
  credential_profile: string | null;
}

export async function ensureGitConnectionProfileColumn(db: DbClient): Promise<void> {
  try {
    await db.query("SELECT credential_profile FROM user_git_connections LIMIT 1");
  } catch {
    await db.exec("ALTER TABLE user_git_connections ADD COLUMN credential_profile VARCHAR(191) NULL");
  }
}

export async function listGitConnections(db: DbClient, userId: string): Promise<GitConnectionStatus[]> {
  const rows = await db.query<ConnectionRow>(
    "SELECT provider, ct, iv, tag, base_url, token_hint, updated_at, credential_profile FROM user_git_connections WHERE user_id = ?",
    [userId]
  );
  const statuses: GitConnectionStatus[] = rows.map((row) => ({
    provider: row.provider,
    connected: true,
    hint: row.token_hint,
    baseUrl: row.base_url,
    updatedAt: row.updated_at,
    profile: row.credential_profile,
  }));

  // Existing installations keep working without a destructive migration. Saving the
  // connection from the new Settings screen writes it to the generic table.
  if (!statuses.some((status) => status.provider === "bitbucket_server")) {
    const legacy = await getBitbucketTokenStatus(db, userId);
    if (legacy.connected) statuses.push({ provider: "bitbucket_server", ...legacy, profile: null });
  }
  return statuses;
}

export async function setGitConnection(
  db: DbClient,
  userId: string,
  provider: GitProviderId,
  token: string,
  baseUrl: string | undefined,
  profile: string | undefined,
  secretEncKey: string
): Promise<void> {
  const encrypted = encryptSecret(token, secretEncKey);
  await upsertRow(
    db,
    "user_git_connections",
    { user_id: userId, provider },
    { ...encrypted, base_url: baseUrl?.replace(/\/+$/, "") || null, credential_profile: profile || null, token_hint: token ? token.slice(-4) : null, updated_at: new Date().toISOString() }
  );
}

export async function deleteGitConnection(db: DbClient, userId: string, provider: GitProviderId): Promise<void> {
  await db.exec("DELETE FROM user_git_connections WHERE user_id = ? AND provider = ?", [userId, provider]);
  if (provider === "bitbucket_server") await deleteBitbucketToken(db, userId);
}

export async function getDecryptedGitConnection(
  db: DbClient,
  userId: string,
  provider: GitProviderId,
  secretEncKey: string
): Promise<GitProviderConnection | null> {
  const rows = await db.query<ConnectionRow>(
    "SELECT provider, ct, iv, tag, base_url, token_hint, updated_at, credential_profile FROM user_git_connections WHERE user_id = ? AND provider = ?",
    [userId, provider]
  );
  if (rows[0]) {
    return {
      provider,
      token: decryptSecret({ ct: rows[0].ct, iv: rows[0].iv, tag: rows[0].tag }, secretEncKey),
      baseUrl: rows[0].base_url,
      profile: rows[0].credential_profile,
    };
  }
  if (provider === "bitbucket_server") {
    const legacy = await getDecryptedBitbucketToken(db, userId, secretEncKey);
    return legacy ? { provider, ...legacy } : null;
  }
  return null;
}
