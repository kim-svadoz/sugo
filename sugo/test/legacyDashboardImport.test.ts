import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dashboardPaths } from "../src/lifecycle/dashboardRuntime.js";

const exec = promisify(execFile);
// vitest의 모듈 해석이 아직 실험 단계인 node:sqlite를 못 풀어서 createRequire로 우회한다.
// @types/node 20에는 node:sqlite 타입이 없어 쓰는 표면만 선언한다.
interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[] };
  close(): void;
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => Db;
};
const script = join(__dirname, "..", "scripts", "import-legacy-dashboard-db.mjs");
// 임의로 만든 테이블 이름 대신 실제 대시보드 스키마로 원본 DB를 만든다.
const schemaFile = join(__dirname, "..", "..", "dashboard", "backend", "test", "schema.sqlite.sql");

let home: string;
let work: string;
let source: string;

const run = (args: string[]) =>
  exec(process.execPath, [script, ...args], { env: { ...process.env, SUGO_HOME_OVERRIDE: home } }).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "sugo-legacy-home-"));
  work = mkdtempSync(join(tmpdir(), "sugo-legacy-src-"));
  source = join(work, "local.db");
  const db = new DatabaseSync(source);
  db.exec(readFileSync(schemaFile, "utf8"));
  db.exec("INSERT INTO sugo_users (id, display_name) VALUES ('demo-user', 'demo-user')");
  db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES ('demo-user', 'ws-1'), ('demo-user', 'ws-2')");
  db.close();
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe("기존 dev-local DB 이전", () => {
  it("사용자 데이터 폴더로 스냅샷을 복사하고 원본은 그대로 둔다", async () => {
    const before = readFileSync(source);

    const { code, out } = await run([source]);

    expect(code).toBe(0);
    expect(out).toContain("sugo_workspaces: 2");
    expect(out).toContain("user_api_tokens: 0");
    const copy = new DatabaseSync(dashboardPaths(home).dataDir + "/dashboard.db", { readOnly: true });
    expect(copy.prepare("SELECT id FROM sugo_users").all()).toEqual([{ id: "demo-user" }]);
    copy.close();
    expect(readFileSync(source).equals(before)).toBe(true);
    expect(statSync(join(dashboardPaths(home).dataDir, "dashboard.db")).mode & 0o077).toBe(0);
  });

  it("이미 대상 DB가 있으면 덮어쓰지 않는다", async () => {
    await run([source]);
    writeFileSync(join(dashboardPaths(home).dataDir, "marker"), "x");

    const second = await run([source]);

    expect(second.code).toBe(1);
    expect(second.err).toContain("not overwritten");
  });

  it("번들 대시보드가 실행 중이면 거부한다", async () => {
    const paths = dashboardPaths(home);
    mkdirSync(paths.dataDir, { recursive: true });
    writeFileSync(paths.stateFile, JSON.stringify({ pid: process.pid, port: 1, startedAt: "2026-01-01T00:00:00Z" }));

    const { code, err } = await run([source]);

    expect(code).toBe(1);
    expect(err).toContain("is running");
  });

  it("원본이 없으면 실패한다", async () => {
    const { code, err } = await run([join(work, "missing.db")]);

    expect(code).toBe(1);
    expect(err).toContain("not found");
  });
});
