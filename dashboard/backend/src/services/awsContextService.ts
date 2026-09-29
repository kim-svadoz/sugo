import type { DbClient } from "../db/client.js";
import { parseMaybeJson } from "../db/jsonColumn.js";
import { upsertRow } from "../db/upsert.js";
import type { AwsContextClient, AwsServiceInventory } from "../aws/contextClient.js";

export interface AwsContextStatus {
  connected: boolean;
  profile: string | null;
  region: string | null;
  accountHint: string | null;
  principal: string | null;
  observedAt: string | null;
  inventory: AwsServiceInventory[];
}

interface AccountRow { profile: string; region: string; account_id: string; principal_arn: string; }
interface SnapshotRow { payload: unknown; observed_at: string; }
const DEFAULT_ACCOUNT_NAME = "default";

export async function getAwsContextStatus(db: DbClient, userId: string): Promise<AwsContextStatus> {
  const accounts = await db.query<AccountRow>("SELECT profile, region, account_id, principal_arn FROM user_aws_context_accounts WHERE user_id = ? AND name = ?", [userId, DEFAULT_ACCOUNT_NAME]);
  if (!accounts[0]) return { connected: false, profile: null, region: null, accountHint: null, principal: null, observedAt: null, inventory: [] };
  const snapshots = await db.query<SnapshotRow>("SELECT payload, observed_at FROM user_aws_context_snapshots WHERE user_id = ? AND account_name = ?", [userId, DEFAULT_ACCOUNT_NAME]);
  return {
    connected: true,
    profile: accounts[0].profile,
    region: accounts[0].region,
    accountHint: accounts[0].account_id.slice(-4),
    principal: accounts[0].principal_arn.split("/").at(-1) ?? null,
    observedAt: snapshots[0]?.observed_at ?? null,
    inventory: parseMaybeJson<AwsServiceInventory[]>(snapshots[0]?.payload, []),
  };
}

export async function connectAwsContext(db: DbClient, userId: string, profile: string, region: string, client: AwsContextClient): Promise<void> {
  const identity = await client.identity({ profile, region });
  await upsertRow(db, "user_aws_context_accounts", { user_id: userId, name: DEFAULT_ACCOUNT_NAME }, {
    profile, region, account_id: identity.accountId, principal_arn: identity.arn, updated_at: new Date().toISOString(),
  });
}

export async function refreshAwsContext(db: DbClient, userId: string, client: AwsContextClient): Promise<AwsServiceInventory[]> {
  const rows = await db.query<AccountRow>("SELECT profile, region, account_id, principal_arn FROM user_aws_context_accounts WHERE user_id = ? AND name = ?", [userId, DEFAULT_ACCOUNT_NAME]);
  if (!rows[0]) throw Object.assign(new Error("AWS context is not connected"), { code: "AWS_CONTEXT_NOT_CONNECTED" });
  const inventory = await client.inventory({ profile: rows[0].profile, region: rows[0].region });
  await upsertRow(db, "user_aws_context_snapshots", { user_id: userId, account_name: DEFAULT_ACCOUNT_NAME }, {
    payload: JSON.stringify(inventory), observed_at: new Date().toISOString(),
  });
  return inventory;
}

export async function disconnectAwsContext(db: DbClient, userId: string): Promise<void> {
  await db.exec("DELETE FROM user_aws_context_snapshots WHERE user_id = ? AND account_name = ?", [userId, DEFAULT_ACCOUNT_NAME]);
  await db.exec("DELETE FROM user_aws_context_accounts WHERE user_id = ? AND name = ?", [userId, DEFAULT_ACCOUNT_NAME]);
}
