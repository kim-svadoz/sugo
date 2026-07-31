import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitActivity } from "../src/dashboard/activity.js";
import { drainRetryQueue, pushEvent } from "../src/dashboard/client.js";
import { resolveDashboardConfig } from "../src/dashboard/config.js";
import { DASHBOARD_SYNC_SCHEMA_VERSION } from "../src/dashboard/schemaVersion.js";
import { syncRetryQueuePath } from "../src/hulk/storage.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-dashboard-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.SUGO_DASHBOARD_API_URL;
  delete process.env.SUGO_DASHBOARD_USER_ID;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("resolveDashboardConfig", () => {
  it("env var가 없고 settings.json도 없으면 disabled", async () => {
    const config = await resolveDashboardConfig();
    expect(config.enabled).toBe(false);
  });

  it("SUGO_DASHBOARD_API_URL이 있으면 enabled+apiUrl로 인식한다", async () => {
    process.env.SUGO_DASHBOARD_API_URL = "http://localhost:9999";
    process.env.SUGO_DASHBOARD_USER_ID = "tester";
    const config = await resolveDashboardConfig();
    expect(config).toEqual({ enabled: true, apiUrl: "http://localhost:9999", userId: "tester" });
  });

  it("~/.claude/sugo/settings.json의 dashboard.enabled=true면 인식한다", async () => {
    const dir = join(fakeHome, ".claude", "sugo");
    await mkdir(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ dashboard: { enabled: true, apiUrl: "http://x", userId: "u1" } }));
    const config = await resolveDashboardConfig();
    expect(config).toEqual({ enabled: true, apiUrl: "http://x", userId: "u1" });
  });

  it("settings.json의 dashboard.enabled가 false면 disabled로 유지한다", async () => {
    const dir = join(fakeHome, ".claude", "sugo");
    await mkdir(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ dashboard: { enabled: false, apiUrl: "http://x" } }));
    const config = await resolveDashboardConfig();
    expect(config.enabled).toBe(false);
  });
});

describe("pushEvent — fire-and-forget, 절대 던지지 않는다", () => {
  it("disabled면 아무 것도 하지 않고 조용히 반환한다", async () => {
    await expect(pushEvent("/api/sync/task", "POST", { hello: "world" })).resolves.toBeUndefined();
  });

  it("실제 서버가 200을 반환하면 성공 처리하고 재시도 큐에 안 쌓는다", async () => {
    let received: unknown;
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received = JSON.parse(body);
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${port}`;

    await pushEvent("/api/sync/task", "POST", { taskId: "t-1" });
    expect(received).toEqual({ taskId: "t-1", schemaVersion: DASHBOARD_SYNC_SCHEMA_VERSION });

    let queueExists = true;
    try {
      readFileSync(syncRetryQueuePath(), "utf-8");
    } catch {
      queueExists = false;
    }
    expect(queueExists).toBe(false);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("서버가 죽어있어도 던지지 않고 재시도 큐에 조용히 쌓는다", async () => {
    process.env.SUGO_DASHBOARD_API_URL = "http://127.0.0.1:1"; // 아무도 안 듣는 포트
    await expect(pushEvent("/api/sync/task", "POST", { taskId: "t-2" })).resolves.toBeUndefined();
    const raw = readFileSync(syncRetryQueuePath(), "utf-8");
    const queue = JSON.parse(raw);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].endpoint).toBe("/api/sync/task");
    expect(queue.items[0].data).toEqual({ taskId: "t-2", schemaVersion: DASHBOARD_SYNC_SCHEMA_VERSION });
    expect(queue.items[0].retryCount).toBe(0);
  });
});

describe("drainRetryQueue — 재시도 소진 시 버림, 성공 시 제거", () => {
  it("서버가 살아나면 큐에 쌓인 항목을 성공 처리하고 큐에서 제거한다", async () => {
    process.env.SUGO_DASHBOARD_API_URL = "http://127.0.0.1:1";
    await pushEvent("/api/sync/task", "POST", { taskId: "t-3" });

    const received: unknown[] = [];
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${port}`;

    await drainRetryQueue();
    expect(received).toEqual([{ taskId: "t-3", schemaVersion: DASHBOARD_SYNC_SCHEMA_VERSION }]);

    const raw = readFileSync(syncRetryQueuePath(), "utf-8");
    expect(JSON.parse(raw).items).toHaveLength(0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("5회 재시도를 넘기면 항목을 버린다(무한 축적 방지)", async () => {
    process.env.SUGO_DASHBOARD_API_URL = "http://127.0.0.1:1";
    await pushEvent("/api/sync/task", "POST", { taskId: "t-4" });
    for (let i = 0; i < 6; i++) {
      await drainRetryQueue();
    }
    const raw = readFileSync(syncRetryQueuePath(), "utf-8");
    expect(JSON.parse(raw).items).toHaveLength(0);
  });
});

describe("emitActivity — Activity Stream", () => {
  it("disabled면 조용히 아무 것도 안 한다", async () => {
    await expect(
      emitActivity({ workspaceName: "ws1", agent: "MAIN", eventType: "SYSTEM", message: "test" }),
    ).resolves.toBeUndefined();
  });

  it("enabled면 /api/activity/ingest로 POST한다", async () => {
    let received: unknown;
    const server: Server = createServer((req, res) => {
      received = { path: req.url, method: req.method };
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received = { ...(received as object), body: JSON.parse(body) };
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${port}`;
    process.env.SUGO_DASHBOARD_USER_ID = "u1";

    await emitActivity({ workspaceName: "ws1", agent: "CODE", handoffTo: "test-agent", eventType: "HANDOFF", message: "핸드오프" });

    const r = received as { path: string; method: string; body: Record<string, unknown> };
    expect(r.path).toBe("/api/activity/ingest");
    expect(r.method).toBe("POST");
    expect(r.body.userId).toBe("u1");
    expect(r.body.workspaceName).toBe("ws1");
    expect(r.body.eventType).toBe("HANDOFF");
    expect(r.body.ts).toBeDefined();

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
