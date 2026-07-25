import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { generateApiToken, hashApiToken, looksLikeApiToken } from "../src/auth/apiToken.js";
import { createApiToken, resolveUserIdByToken, listApiTokens, revokeApiToken } from "../src/services/apiTokenService.js";
import { requireApiAuth, optionalApiAuth } from "../src/auth/requireApiAuth.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

let db: DbClient;
beforeEach(async () => {
  db = createSqliteClient();
  await db.execScript(schema);
  await db.exec("INSERT INTO sugo_users (id, display_name) VALUES (?, ?)", ["alice", "Alice"]);
  await db.exec("INSERT INTO sugo_users (id, display_name) VALUES (?, ?)", ["bob", "Bob"]);
});

describe("apiToken 순수함수", () => {
  it("generateApiToken은 sugo_pat_ 접두사 + 64자 해시 + 힌트를 만든다", () => {
    const t = generateApiToken();
    expect(t.token.startsWith("sugo_pat_")).toBe(true);
    expect(t.hash).toHaveLength(64);
    expect(hashApiToken(t.token)).toBe(t.hash);
    expect(t.token.endsWith(t.hint)).toBe(true);
    expect(looksLikeApiToken(t.token)).toBe(true);
    expect(looksLikeApiToken("garbage")).toBe(false);
  });
  it("매번 다른 토큰을 만든다", () => {
    expect(generateApiToken().token).not.toBe(generateApiToken().token);
  });
});

describe("apiTokenService 왕복 + 사용자 격리", () => {
  it("발급한 토큰으로 userId를 해석한다", async () => {
    const { token } = await createApiToken(db, "alice", "laptop");
    expect(await resolveUserIdByToken(db, token)).toBe("alice");
  });

  it("모르는/형식 틀린 토큰은 null", async () => {
    expect(await resolveUserIdByToken(db, "sugo_pat_deadbeefdeadbeef00")).toBeNull();
    expect(await resolveUserIdByToken(db, "garbage")).toBeNull();
  });

  it("격리: alice 토큰은 alice로, bob 토큰은 bob으로만 해석된다", async () => {
    const a = await createApiToken(db, "alice", null);
    const b = await createApiToken(db, "bob", null);
    expect(await resolveUserIdByToken(db, a.token)).toBe("alice");
    expect(await resolveUserIdByToken(db, b.token)).toBe("bob");
  });

  it("목록은 평문/해시 없이 힌트만 노출한다", async () => {
    const { token } = await createApiToken(db, "alice", "ci");
    const list = await listApiTokens(db, "alice");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("ci");
    expect(list[0].hint).toBe(token.slice(-6));
    expect(JSON.stringify(list)).not.toContain(token); // 평문 미노출
    expect(JSON.stringify(list)).not.toContain(hashApiToken(token)); // 해시 미노출
  });

  it("revoke는 본인 것만 지운다(남의 토큰 못 지움)", async () => {
    const a = await createApiToken(db, "alice", null);
    expect(await revokeApiToken(db, "bob", a.id)).toBe(false);
    expect(await resolveUserIdByToken(db, a.token)).toBe("alice"); // 여전히 유효
    expect(await revokeApiToken(db, "alice", a.id)).toBe(true);
    expect(await resolveUserIdByToken(db, a.token)).toBeNull(); // 폐기됨
  });

  it("사용 시 last_used_at이 갱신된다", async () => {
    const { token, id } = await createApiToken(db, "alice", null);
    const before = await db.query<{ last_used_at: string | null }>(
      "SELECT last_used_at FROM user_api_tokens WHERE id = ?",
      [id]
    );
    expect(before[0].last_used_at).toBeNull();
    await resolveUserIdByToken(db, token);
    const after = await db.query<{ last_used_at: string | null }>(
      "SELECT last_used_at FROM user_api_tokens WHERE id = ?",
      [id]
    );
    expect(after[0].last_used_at).not.toBeNull();
  });
});

interface MockRes {
  statusCode: number;
  body: unknown;
  status(c: number): MockRes;
  json(b: unknown): MockRes;
}
function mockRes(): MockRes {
  return {
    statusCode: 0,
    body: null,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
}

describe("requireApiAuth 미들웨어 — body userId 사칭 무력화", () => {
  it("유효 토큰이면 req.userId를 세우고 next()", async () => {
    const { token } = await createApiToken(db, "alice", null);
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as { headers: Record<string, string>; userId?: string };
    let nexted = false;
    await requireApiAuth(db)(req as never, mockRes() as never, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect(req.userId).toBe("alice");
  });

  it("토큰 없으면 401", async () => {
    const req = { headers: {} } as never;
    const res = mockRes();
    let nexted = false;
    await requireApiAuth(db)(req, res as never, () => {
      nexted = true;
    });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("틀린 토큰이면 401이고 req.userId는 안 세워진다(body의 userId를 신뢰하지 않음)", async () => {
    const req = { headers: { authorization: "Bearer sugo_pat_wrongwrongwrongwrong" }, body: { userId: "alice" } } as unknown as {
      headers: Record<string, string>;
      body: unknown;
      userId?: string;
    };
    const res = mockRes();
    let nexted = false;
    await requireApiAuth(db)(req as never, res as never, () => {
      nexted = true;
    });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(req.userId).toBeUndefined();
  });

  it("optionalApiAuth: 토큰 없어도 통과, 유효하면 userId를 세운다", async () => {
    const noTok = { headers: {} } as unknown as { headers: Record<string, string>; userId?: string };
    let n1 = false;
    await optionalApiAuth(db)(noTok as never, mockRes() as never, () => {
      n1 = true;
    });
    expect(n1).toBe(true);
    expect(noTok.userId).toBeUndefined();

    const { token } = await createApiToken(db, "bob", null);
    const withTok = { headers: { authorization: `Bearer ${token}` } } as unknown as { headers: Record<string, string>; userId?: string };
    let n2 = false;
    await optionalApiAuth(db)(withTok as never, mockRes() as never, () => {
      n2 = true;
    });
    expect(n2).toBe(true);
    expect(withTok.userId).toBe("bob");
  });
});
