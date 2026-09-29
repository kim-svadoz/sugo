import type { DbClient } from "../db/client.js";
import { parseMaybeJson } from "../db/jsonColumn.js";
import { upsertRow } from "../db/upsert.js";
import type { AwsContextClient, AwsServiceInventory } from "../aws/contextClient.js";

export interface AwsContextAccountSummary { name: string; profile: string; region: string; accountHint: string; principal: string | null; }
export interface AwsContextStatus {
  connected: boolean; activeAccount: string | null; accounts: AwsContextAccountSummary[];
  profile: string | null; region: string | null; accountHint: string | null; principal: string | null;
  observedAt: string | null; inventory: AwsServiceInventory[];
}
interface AccountRow { name: string; profile: string; region: string; account_id: string; principal_arn: string; }
interface PreferenceRow { active_account_name: string; }
interface SnapshotRow { payload: unknown; observed_at: string; }

async function accountState(db: DbClient, userId: string, requestedAccount?: string): Promise<{ accounts: AccountRow[]; active: AccountRow | null }> {
  const accounts = await db.query<AccountRow>("SELECT name, profile, region, account_id, principal_arn FROM user_aws_context_accounts WHERE user_id = ? ORDER BY name ASC", [userId]);
  const preferences = await db.query<PreferenceRow>("SELECT active_account_name FROM user_aws_context_preferences WHERE user_id = ?", [userId]);
  const selectedName = requestedAccount ?? preferences[0]?.active_account_name;
  return { accounts, active: accounts.find((account) => account.name === selectedName) ?? (requestedAccount ? null : accounts[0] ?? null) };
}

export async function getAwsContextStatus(db: DbClient, userId: string, requestedAccount?: string): Promise<AwsContextStatus> {
  const { accounts, active } = await accountState(db, userId, requestedAccount);
  const summaries = accounts.map((account) => ({ name: account.name, profile: account.profile, region: account.region, accountHint: account.account_id.slice(-4), principal: account.principal_arn.split("/").at(-1) ?? null }));
  if (!active) return { connected: false, activeAccount: null, accounts: summaries, profile: null, region: null, accountHint: null, principal: null, observedAt: null, inventory: [] };
  const snapshots = await db.query<SnapshotRow>("SELECT payload, observed_at FROM user_aws_context_snapshots WHERE user_id = ? AND account_name = ?", [userId, active.name]);
  return { connected: true, activeAccount: active.name, accounts: summaries, profile: active.profile, region: active.region, accountHint: active.account_id.slice(-4), principal: active.principal_arn.split("/").at(-1) ?? null, observedAt: snapshots[0]?.observed_at ?? null, inventory: parseMaybeJson<AwsServiceInventory[]>(snapshots[0]?.payload, []) };
}

export async function connectAwsContext(db: DbClient, userId: string, name: string, profile: string, region: string, client: AwsContextClient): Promise<void> {
  const identity = await client.identity({ profile, region });
  await upsertRow(db, "user_aws_context_accounts", { user_id: userId, name }, { profile, region, account_id: identity.accountId, principal_arn: identity.arn, updated_at: new Date().toISOString() });
  await setActiveAwsContext(db, userId, name);
}

export async function setActiveAwsContext(db: DbClient, userId: string, name: string): Promise<void> {
  const rows = await db.query<{ name: string }>("SELECT name FROM user_aws_context_accounts WHERE user_id = ? AND name = ?", [userId, name]);
  if (!rows[0]) throw Object.assign(new Error("AWS context account not found"), { code: "AWS_CONTEXT_NOT_FOUND" });
  await upsertRow(db, "user_aws_context_preferences", { user_id: userId }, { active_account_name: name, updated_at: new Date().toISOString() });
}

export async function refreshAwsContext(db: DbClient, userId: string, client: AwsContextClient): Promise<AwsServiceInventory[]> {
  const { active } = await accountState(db, userId);
  if (!active) throw Object.assign(new Error("AWS context is not connected"), { code: "AWS_CONTEXT_NOT_CONNECTED" });
  const inventory = await client.inventory({ profile: active.profile, region: active.region });
  await upsertRow(db, "user_aws_context_snapshots", { user_id: userId, account_name: active.name }, { payload: JSON.stringify(inventory), observed_at: new Date().toISOString() });
  return inventory;
}

export async function refreshAllAwsContexts(db: DbClient, userId: string, client: AwsContextClient): Promise<string[]> {
  const { accounts } = await accountState(db, userId);
  const refreshed: string[] = [];
  for (const account of accounts) {
    const inventory = await client.inventory({ profile: account.profile, region: account.region });
    await upsertRow(db, "user_aws_context_snapshots", { user_id: userId, account_name: account.name }, {
      payload: JSON.stringify(inventory),
      observed_at: new Date().toISOString(),
    });
    refreshed.push(account.name);
  }
  return refreshed;
}

export async function disconnectAwsContext(db: DbClient, userId: string, name: string): Promise<void> {
  await db.exec("DELETE FROM user_aws_context_snapshots WHERE user_id = ? AND account_name = ?", [userId, name]);
  await db.exec("DELETE FROM user_aws_context_accounts WHERE user_id = ? AND name = ?", [userId, name]);
  await db.exec("DELETE FROM user_aws_context_preferences WHERE user_id = ? AND active_account_name = ?", [userId, name]);
}
