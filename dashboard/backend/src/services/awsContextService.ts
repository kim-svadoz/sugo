import type { DbClient } from "../db/client.js";
import { parseMaybeJson } from "../db/jsonColumn.js";
import { upsertRow } from "../db/upsert.js";
import type { AwsContextClient, AwsServiceInventory } from "../aws/contextClient.js";

export interface AwsContextAccountSummary { name: string; profile: string; region: string; accountHint: string; principal: string | null; }
export interface AwsContextStatus {
  connected: boolean; activeAccount: string | null; accounts: AwsContextAccountSummary[];
  profile: string | null; region: string | null; accountHint: string | null; principal: string | null;
  observedAt: string | null; inventory: AwsServiceInventory[];
  refreshBudget: { remainingToday: number; dailyLimit: number; nextAllowedAt: string | null; timezone: "Asia/Seoul" } | null;
}
interface AccountRow { name: string; profile: string; region: string; account_id: string; principal_arn: string; }
interface PreferenceRow { active_account_name: string; }
interface SnapshotRow { payload: unknown; observed_at: string; }
const REFRESH_COOLDOWN_MS = 5 * 60_000;
const AWS_REFRESH_MIN_INTERVAL_MS = 60 * 60_000;
const AWS_REFRESH_DAILY_LIMIT = 4;
interface BudgetRow { day_key: string; day_count: number; last_started_at: string; }

function kstDayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function nextKstMidnight(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day') + 1) - 9 * 60 * 60_000);
}
function budgetView(row: BudgetRow | undefined, now = new Date()) {
  const today = kstDayKey(now);
  const count = row?.day_key === today ? row.day_count : 0;
  const intervalAt = row ? new Date(Date.parse(row.last_started_at) + AWS_REFRESH_MIN_INTERVAL_MS) : null;
  const resetAt = count >= AWS_REFRESH_DAILY_LIMIT ? nextKstMidnight(now) : null;
  const next = [intervalAt, resetAt].filter((value): value is Date => Boolean(value && value.getTime() > now.getTime())).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { remainingToday: Math.max(0, AWS_REFRESH_DAILY_LIMIT - count), dailyLimit: AWS_REFRESH_DAILY_LIMIT, nextAllowedAt: next?.toISOString() ?? null, timezone: 'Asia/Seoul' as const };
}

async function reserveAwsRefresh(db: DbClient, userId: string, accountName: string, now = new Date()): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rows = await db.query<BudgetRow>('SELECT day_key, day_count, last_started_at FROM user_aws_context_refresh_budget WHERE user_id = ? AND account_name = ?', [userId, accountName]);
    const row = rows[0]; const today = kstDayKey(now); const currentCount = row?.day_key === today ? row.day_count : 0;
    const view = budgetView(row, now);
    if (view.remainingToday === 0) throw Object.assign(new Error('AWS daily refresh limit reached'), { code: 'AWS_REFRESH_DAILY_LIMIT', budget: view });
    if (view.nextAllowedAt) throw Object.assign(new Error('AWS refresh cooldown active'), { code: 'AWS_REFRESH_COOLDOWN', budget: view });
    if (!row) {
      try {
        await db.exec('INSERT INTO user_aws_context_refresh_budget (user_id, account_name, day_key, day_count, last_started_at) VALUES (?, ?, ?, ?, ?)', [userId, accountName, today, 1, now.toISOString()]);
        return;
      } catch { continue; }
    }
    const result = await db.exec('UPDATE user_aws_context_refresh_budget SET day_key = ?, day_count = ?, last_started_at = ? WHERE user_id = ? AND account_name = ? AND day_key = ? AND day_count = ? AND last_started_at = ?', [today, currentCount + 1, now.toISOString(), userId, accountName, row.day_key, row.day_count, row.last_started_at]);
    if (result.affectedRows === 1) return;
  }
  throw Object.assign(new Error('AWS refresh already in progress'), { code: 'AWS_REFRESH_IN_PROGRESS' });
}
function isFresh(observedAt: string | null | undefined): boolean {
  return Boolean(observedAt && Number.isFinite(Date.parse(observedAt)) && Date.now() - Date.parse(observedAt!) < REFRESH_COOLDOWN_MS);
}

async function accountState(db: DbClient, userId: string, requestedAccount?: string): Promise<{ accounts: AccountRow[]; active: AccountRow | null }> {
  const accounts = await db.query<AccountRow>("SELECT name, profile, region, account_id, principal_arn FROM user_aws_context_accounts WHERE user_id = ? ORDER BY name ASC", [userId]);
  const preferences = await db.query<PreferenceRow>("SELECT active_account_name FROM user_aws_context_preferences WHERE user_id = ?", [userId]);
  const selectedName = requestedAccount ?? preferences[0]?.active_account_name;
  return { accounts, active: accounts.find((account) => account.name === selectedName) ?? (requestedAccount ? null : accounts[0] ?? null) };
}

export async function getAwsContextStatus(db: DbClient, userId: string, requestedAccount?: string): Promise<AwsContextStatus> {
  const { accounts, active } = await accountState(db, userId, requestedAccount);
  const summaries = accounts.map((account) => ({ name: account.name, profile: account.profile, region: account.region, accountHint: account.account_id.slice(-4), principal: account.principal_arn.split("/").at(-1) ?? null }));
  if (!active) return { connected: false, activeAccount: null, accounts: summaries, profile: null, region: null, accountHint: null, principal: null, observedAt: null, inventory: [], refreshBudget: null };
  const snapshots = await db.query<SnapshotRow>("SELECT payload, observed_at FROM user_aws_context_snapshots WHERE user_id = ? AND account_name = ?", [userId, active.name]);
  const budgets = await db.query<BudgetRow>('SELECT day_key, day_count, last_started_at FROM user_aws_context_refresh_budget WHERE user_id = ? AND account_name = ?', [userId, active.name]);
  return { connected: true, activeAccount: active.name, accounts: summaries, profile: active.profile, region: active.region, accountHint: active.account_id.slice(-4), principal: active.principal_arn.split("/").at(-1) ?? null, observedAt: snapshots[0]?.observed_at ?? null, inventory: parseMaybeJson<AwsServiceInventory[]>(snapshots[0]?.payload, []), refreshBudget: budgetView(budgets[0]) };
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
  const snapshots = await db.query<SnapshotRow>("SELECT payload, observed_at FROM user_aws_context_snapshots WHERE user_id = ? AND account_name = ?", [userId, active.name]);
  if (isFresh(snapshots[0]?.observed_at)) return parseMaybeJson<AwsServiceInventory[]>(snapshots[0].payload, []);
  await reserveAwsRefresh(db, userId, active.name);
  const inventory = await client.inventory({ profile: active.profile, region: active.region });
  await upsertRow(db, "user_aws_context_snapshots", { user_id: userId, account_name: active.name }, { payload: JSON.stringify(inventory), observed_at: new Date().toISOString() });
  return inventory;
}

export async function refreshAllAwsContexts(db: DbClient, userId: string, client: AwsContextClient): Promise<string[]> {
  const { accounts } = await accountState(db, userId);
  const refreshed: string[] = [];
  for (const account of accounts) {
    const snapshots = await db.query<SnapshotRow>("SELECT payload, observed_at FROM user_aws_context_snapshots WHERE user_id = ? AND account_name = ?", [userId, account.name]);
    if (isFresh(snapshots[0]?.observed_at)) { refreshed.push(account.name); continue; }
    await reserveAwsRefresh(db, userId, account.name);
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
  await db.exec("DELETE FROM user_aws_context_refresh_budget WHERE user_id = ? AND account_name = ?", [userId, name]);
}
