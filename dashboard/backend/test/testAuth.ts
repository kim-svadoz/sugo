import type { DbClient } from "../src/db/client.js";
import { createApiToken } from "../src/services/apiTokenService.js";

// 공개 SaaS 인증 도입(§Phase 1) 이후, 데이터 라우트는 Bearer API 토큰을 요구한다.
// 로직 테스트는 이 헬퍼로 유저를 시딩하고 토큰을 발급받아 헤더를 붙인다.
export async function seedUserToken(db: DbClient, userId = "u1"): Promise<string> {
  await db.exec("INSERT OR IGNORE INTO sugo_users (id, display_name) VALUES (?, ?)", [userId, userId]);
  const { token } = await createApiToken(db, userId, "test");
  return `Bearer ${token}`;
}
