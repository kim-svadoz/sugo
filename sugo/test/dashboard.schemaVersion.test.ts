import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pushEvent } from "../src/dashboard/client.js";
import { DASHBOARD_SYNC_SCHEMA_VERSION } from "../src/dashboard/schemaVersion.js";
import { emitActivity } from "../src/dashboard/activity.js";
import { syncRoadmapSnapshot, syncTask, syncWorkspace } from "../src/dashboard/sync.js";
import { listRetryQueue } from "../src/dashboard/retryQueue.js";

let fakeHome: string;
let server: Server;
let port: number;
const received: { path: string; method?: string; body: Record<string, unknown> }[] = [];

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-schemaversion-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
  received.length = 0;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", method: req.method, body: JSON.parse(body || "{}") });
      res.writeHead(200);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
  process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${port}`;
  process.env.SUGO_DASHBOARD_USER_ID = "u1";
});

afterEach(async () => {
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.SUGO_DASHBOARD_API_URL;
  delete process.env.SUGO_DASHBOARD_USER_ID;
  rmSync(fakeHome, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("§8.2 schemaVersion — 모든 sync payload에 계약 버전을 싣는다", () => {
  it("pushEvent가 POST 본문에 schemaVersion을 주입한다", async () => {
    await pushEvent("/api/sync/user", "POST", { userId: "u1" });
    expect(received[0].body.schemaVersion).toBe(DASHBOARD_SYNC_SCHEMA_VERSION);
  });

  it("DELETE 본문에도 실린다", async () => {
    await pushEvent("/api/sync/task", "DELETE", { userId: "u1", workspaceName: "ws1", id: "t1" });
    expect(received[0].method).toBe("DELETE");
    expect(received[0].body.schemaVersion).toBe(DASHBOARD_SYNC_SCHEMA_VERSION);
  });

  it("도메인 필드를 덮어쓰지 않는다(주입은 추가일 뿐)", async () => {
    await pushEvent("/api/sync/user", "POST", { userId: "u1", displayName: "Kim" });
    expect(received[0].body).toMatchObject({ userId: "u1", displayName: "Kim" });
  });

  it("호출부가 명시한 schemaVersion이 있으면 그 값을 존중한다", async () => {
    await pushEvent("/api/sync/user", "POST", { userId: "u1", schemaVersion: 99 });
    expect(received[0].body.schemaVersion).toBe(99);
  });

  it("sync.ts 래퍼 전량(workspace/task/roadmap)이 버전을 달고 나간다", async () => {
    await syncWorkspace({ name: "ws1", projects: [], created_at: "2026-01-01T00:00:00.000Z" });
    await syncTask("ws1", { id: "t1", title: "T", status: "pending" } as never);
    await syncRoadmapSnapshot("ws1", [{ id: "run-001", title: "R", level: "workstream", status: "pending" } as never]);
    expect(received).toHaveLength(3);
    for (const r of received) expect(r.body.schemaVersion).toBe(DASHBOARD_SYNC_SCHEMA_VERSION);
  });

  it("activity ingest에도 실린다(같은 아웃바운드 경로)", async () => {
    await emitActivity({ workspaceName: "ws1", agent: "MAIN", eventType: "SYSTEM", message: "hi" });
    expect(received[0].path).toBe("/api/activity/ingest");
    expect(received[0].body.schemaVersion).toBe(DASHBOARD_SYNC_SCHEMA_VERSION);
  });

  it("전송 실패로 재시도 큐에 쌓일 때도 버전이 보존된다(WAL 경유 재전송)", async () => {
    process.env.SUGO_DASHBOARD_API_URL = "http://127.0.0.1:1"; // 연결 실패 유도
    await pushEvent("/api/sync/user", "POST", { userId: "u1" });
    const queue = await listRetryQueue();
    expect(queue).toHaveLength(1);
    expect((queue[0].data as Record<string, unknown>).schemaVersion).toBe(DASHBOARD_SYNC_SCHEMA_VERSION);
  });

  it("본문이 객체가 아니면 손대지 않는다(던지지 않음)", async () => {
    await expect(pushEvent("/api/sync/user", "POST", "raw")).resolves.toBeUndefined();
    expect(received[0].body).toBe("raw" as never);
  });
});
