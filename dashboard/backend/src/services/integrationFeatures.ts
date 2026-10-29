import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { DbClient } from "../db/client.js";

/** Preferences › 외부 연동에서 켜고 끄는 기능. 꺼진 기능은 Integrations에서 설정을 숨기고 자동 갱신도 하지 않는다. */
export const integrationFeaturesSchema = z.object({ aws: z.boolean(), pr: z.boolean(), apm: z.boolean() }).strict();
export type IntegrationFeatures = z.infer<typeof integrationFeaturesSchema>;

async function hasRow(db: DbClient, table: string, userId: string): Promise<boolean> {
  const rows = await db.query<{ found: number }>(`SELECT 1 AS found FROM ${table} WHERE user_id = ? LIMIT 1`, [userId]);
  return rows.length > 0;
}

/**
 * 저장한 값이 있으면 그 값을 쓴다. 아직 저장한 적이 없으면 처음 쓰는 사용자는 모두 꺼짐이고,
 * 이 기능이 생기기 전에 이미 연결해 둔 기능은 켜진 상태로 시작해 업데이트 뒤에도 쓰던 화면이 사라지지 않게 한다.
 */
export async function loadIntegrationFeatures(path: string, db: DbClient, userId: string): Promise<IntegrationFeatures> {
  try {
    return integrationFeaturesSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    // 저장한 값이 없거나 읽을 수 없으면 연결 상태에서 시작값을 정한다.
  }
  const [aws, pr, apm] = await Promise.all([
    hasRow(db, "user_aws_context_accounts", userId),
    hasRow(db, "user_git_connections", userId),
    hasRow(db, "user_pinpoint_context", userId),
  ]);
  return { aws, pr, apm };
}

export async function saveIntegrationFeatures(path: string, value: IntegrationFeatures): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
