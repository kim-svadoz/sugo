import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  syncCheckpoint,
  syncDecision,
  syncHistory,
  syncPluginVersion,
  syncRoadmapLink,
  syncRoadmapSnapshot,
  syncTask,
  syncUser,
  syncWorkspace,
  syncWorkspaceMeta,
  unsyncRoadmapLink,
} from "../src/dashboard/sync.js";

let fakeHome: string;
let server: Server;
let port: number;
const received: { path: string; method?: string; body: unknown }[] = [];

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-dashboard-sync-home-"));
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

describe("syncCheckpoint", () => {
  it("/api/sync/checkpoint로 체크포인트를 보낸다", async () => {
    await syncCheckpoint("ws1", { id: "CP-1", title: "체크", checklist: ["a"] });
    expect(received[0].path).toBe("/api/sync/checkpoint");
  });
});

describe("syncHistory", () => {
  it("/api/sync/history로 WorkLog를 보내고, prRefs가 있으면 함께 실어보낸다", async () => {
    await syncHistory(
      "ws1",
      { id: "wl-1", task_id: "t-1", task_title: "기능", completed_at: "2026-01-01T00:00:00.000Z" },
      { baseUrl: "https://x", projectKey: "P", repoSlug: "r", sourceBranch: "feat", targetBranch: "develop" },
    );
    expect(received[0].path).toBe("/api/sync/history");
    const body = received[0].body as Record<string, unknown>;
    expect((body.prRefs as { repoSlug: string }).repoSlug).toBe("r");
  });

  it("prRefs 없이도 보낼 수 있다", async () => {
    await syncHistory("ws1", { id: "wl-1", task_id: "t-1", task_title: "기능", completed_at: "2026-01-01T00:00:00.000Z" });
    const body = received[0].body as Record<string, unknown>;
    expect(body.prRefs).toBeUndefined();
  });
});

describe("syncDecision", () => {
  it("/api/sync/decision으로 Spec을 보낸다", async () => {
    await syncDecision("ws1", { name: "인증 방식", type: "architecture", tags: [], content: "JWT", created_at: "t" });
    expect(received[0].path).toBe("/api/sync/decision");
  });
});

describe("syncPluginVersion / syncUser", () => {
  it("각각 해당 엔드포인트로 보낸다", async () => {
    await syncPluginVersion("0.1.0");
    await syncUser();
    expect(received.map((r) => r.path)).toEqual(["/api/sync/plugin-version", "/api/sync/user"]);
  });
});

describe("syncWorkspaceMeta", () => {
  it("/api/sync/workspace-meta로 임의 메타데이터를 보낸다", async () => {
    await syncWorkspaceMeta("ws1", { theme: "dark" });
    expect(received[0].path).toBe("/api/sync/workspace-meta");
  });
});

describe("syncRoadmapLink / unsyncRoadmapLink", () => {
  it("POST/DELETE로 각각 링크 편집 이벤트를 보낸다", async () => {
    await syncRoadmapLink("ws1", "A", "B");
    await unsyncRoadmapLink("ws1", "A", "B");
    expect(received.map((r) => r.method)).toEqual(["POST", "DELETE"]);
    expect(received.map((r) => r.path)).toEqual(["/api/sync/roadmap/link", "/api/sync/roadmap/link"]);
  });
});
