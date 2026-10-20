import { describe, expect, it, vi } from "vitest";
import { kstRefreshDay, runDueContextRefresh } from "../src/services/contextAutoRefreshService.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("daily AWS and Pinpoint refresh", () => {
  it("is not due before 08:00 KST", () => {
    expect(kstRefreshDay(new Date("2026-10-20T22:59:59.000Z"))).toBeNull();
    expect(kstRefreshDay(new Date("2026-10-20T23:00:00.000Z"))).toBe("2026-10-21");
  });

  it("runs AWS before Pinpoint once per KST day and catches up after 08:00", async () => {
    const db = createSqliteClient(":memory:");
    await db.execScript(schema);
    await db.exec("INSERT INTO sugo_users (id, display_name) VALUES (?, ?)", ["u", "User"]);
    await db.exec("INSERT INTO user_aws_context_accounts (user_id, name, profile, region, account_id, principal_arn, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ["u", "dev", "dev", "ap-northeast-2", "1", "arn/x", "now"]);
    await db.exec("INSERT INTO user_pinpoint_context (user_id, base_url, updated_at) VALUES (?, ?, ?)", ["u", "http://pinpoint", "now"]);
    const order: string[] = [];
    const refreshAws = vi.fn(async () => { order.push("aws"); });
    const refreshPinpoint = vi.fn(async () => { order.push("pinpoint"); });

    const now = new Date("2026-10-21T02:00:00.000Z");
    await runDueContextRefresh(db, now, refreshAws, refreshPinpoint);
    await runDueContextRefresh(db, now, refreshAws, refreshPinpoint);

    expect(order).toEqual(["aws", "pinpoint"]);
    await db.close();
  });
});
