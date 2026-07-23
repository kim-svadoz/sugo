import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncRoadmapSnapshot, syncTask, syncWorkspace } from "../src/dashboard/sync.js";

let fakeHome: string;
let server: Server;
let port: number;
const received: { path: string; body: unknown }[] = [];

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-dashboard-sync-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
  received.length = 0;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", body: JSON.parse(body) });
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

describe("syncWorkspace", () => {
  it("/api/sync/workspace로 워크스페이스 스냅샷을 보낸다", async () => {
    await syncWorkspace({ name: "ws1", projects: ["/tmp/p"], created_at: "2026-01-01T00:00:00.000Z" });
    expect(received).toHaveLength(1);
    expect(received[0].path).toBe("/api/sync/workspace");
    const body = received[0].body as Record<string, unknown>;
    expect(body.userId).toBe("u1");
    expect(body.name).toBe("ws1");
    expect(body.projects).toEqual(["/tmp/p"]);
  });
});

describe("syncTask", () => {
  it("/api/sync/task로 태스크를 보낸다", async () => {
    await syncTask("ws1", {
      id: "t-1",
      title: "기능",
      project: "/tmp/p",
      status: "in_progress",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(received[0].path).toBe("/api/sync/task");
    const body = received[0].body as Record<string, unknown>;
    expect(body.workspaceName).toBe("ws1");
    expect((body.task as { id: string }).id).toBe("t-1");
  });
});

describe("syncRoadmapSnapshot", () => {
  it("/api/sync/roadmap으로 노드 스냅샷 전체를 replace 방식으로 보낸다", async () => {
    await syncRoadmapSnapshot("ws1", [{ id: "A", title: "A", level: "task", status: "pending", dependsOn: [] }]);
    expect(received[0].path).toBe("/api/sync/roadmap");
    const body = received[0].body as Record<string, unknown>;
    expect(body.workspaceName).toBe("ws1");
    expect((body.nodes as unknown[])).toHaveLength(1);
  });
});
