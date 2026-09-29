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
const received: { path: string; method?: string; body: unknown; auth?: string }[] = [];

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-dashboard-sync-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
  received.length = 0;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", method: req.method, body: JSON.parse(body || "{}"), auth: req.headers.authorization });
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

describe("공개 SaaS 인증 — apiToken", () => {
  it("SUGO_DASHBOARD_API_TOKEN이 있으면 Authorization: Bearer를 실어 보낸다", async () => {
    process.env.SUGO_DASHBOARD_API_TOKEN = "sugo_pat_testtoken123";
    try {
      await syncWorkspace({ name: "ws1", projects: [], created_at: "2026-01-01T00:00:00.000Z" });
      expect(received[0].auth).toBe("Bearer sugo_pat_testtoken123");
    } finally {
      delete process.env.SUGO_DASHBOARD_API_TOKEN;
    }
  });

  it("토큰이 없으면 Authorization 헤더를 붙이지 않는다(self-host/로컬 호환)", async () => {
    await syncWorkspace({ name: "ws2", projects: [], created_at: "2026-01-01T00:00:00.000Z" });
    expect(received[0].auth).toBeUndefined();
  });
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
  it("/api/sync/task로 태스크를 대시보드 평평한 wire 포맷(camelCase, top-level)으로 보낸다", async () => {
    await syncTask("ws1", {
      id: "t-1",
      title: "기능",
      project: "/tmp/p",
      status: "in_progress",
      created_at: "2026-01-01T00:00:00.000Z",
      started_at: "2026-01-02T00:00:00.000Z",
    });
    expect(received[0].path).toBe("/api/sync/task");
    const body = received[0].body as Record<string, unknown>;
    expect(body.workspaceName).toBe("ws1");
    // seam 어댑터: task가 감싸지지 않고 평평하게, started_at→startedAt로 나간다
    expect(body.id).toBe("t-1");
    expect(body.title).toBe("기능");
    expect(body.startedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(body.task).toBeUndefined();
  });

  it("대시보드 status enum에 없는 값(idea/dropped)을 매핑한다", async () => {
    await syncTask("ws1", { id: "t-2", title: "아이디어", project: "/p", status: "idea", created_at: "t" });
    expect((received[0].body as Record<string, unknown>).status).toBe("pending");
    received.length = 0;
    await syncTask("ws1", { id: "t-3", title: "폐기", project: "/p", status: "dropped", created_at: "t" });
    expect((received[0].body as Record<string, unknown>).status).toBe("archived");
  });
});

describe("syncRoadmapSnapshot", () => {
  it("/api/sync/roadmap로 노드 스냅샷 전체를 replace 방식으로 보낸다(대시보드 리네임)", async () => {
    await syncRoadmapSnapshot("ws1", [{ id: "A", title: "A", level: "task", status: "pending", dependsOn: [] }]);
    expect(received[0].path).toBe("/api/sync/roadmap");
    const body = received[0].body as Record<string, unknown>;
    expect(body.workspaceName).toBe("ws1");
    expect((body.nodes as unknown[])).toHaveLength(1);
  });

  it("사람 차단의 질문·상황·선택지·복귀 지점을 구조화해 보낸다", async () => {
    await syncRoadmapSnapshot("ws1", [{
      id: "A", title: "A", level: "task", status: "blocked", dependsOn: [], note: "승인자는?",
      humanBlocker: {
        schemaVersion: 1, sessionId: "plan-1", stage: "CODE_RUNNING", resumeAction: "code_done",
        summary: "승인 정책 구현 중", question: "승인자는?", context: ["기준 없음"],
        options: [{ id: "lead", label: "팀장", impact: "통제 강화" }], blockedNextStep: "권한 검사 구현",
        createdAt: "2026-09-29T00:00:00.000Z",
      },
    }]);
    const node = ((received[0].body as { nodes: Array<Record<string, unknown>> }).nodes)[0];
    expect(node.humanBlocker).toMatchObject({ sessionId: "plan-1", resumeAction: "code_done" });
  });
});

describe("syncCheckpoint", () => {
  it("/api/sync/checkpoint로 체크포인트를 보낸다", async () => {
    await syncCheckpoint("ws1", { id: "CP-1", title: "체크", checklist: ["a"] });
    expect(received[0].path).toBe("/api/sync/checkpoint");
  });
});

describe("syncHistory", () => {
  it("/api/sync/history로 WorkLog를 평평한 wire 포맷으로 보낸다(task_id→taskId, metrics 펼침)", async () => {
    await syncHistory("ws1", {
      id: "wl-1",
      task_id: "t-1",
      task_title: "기능",
      completed_at: "2026-01-01T00:00:00.000Z",
      key_decisions: ["JWT 채택"],
      metrics: { estimatedHumanHours: 3, estimationBasis: "복잡도" },
    });
    expect(received[0].path).toBe("/api/sync/history");
    const body = received[0].body as Record<string, unknown>;
    expect(body.id).toBe("wl-1");
    expect(body.taskId).toBe("t-1");
    expect(body.taskTitle).toBe("기능");
    expect(body.keyDecisions).toEqual(["JWT 채택"]);
    expect(body.estimatedHumanHours).toBe(3);
    expect(body.estimationBasis).toBe("복잡도");
    expect(body.workLog).toBeUndefined();
  });

  it("prRefs는 history wire에 실리지 않는다(정본 경로는 roadmap 노드 workResult.prRefs)", async () => {
    await syncHistory(
      "ws1",
      { id: "wl-1", task_id: "t-1", task_title: "기능", completed_at: "2026-01-01T00:00:00.000Z" },
      { baseUrl: "https://x", projectKey: "P", repoSlug: "r", sourceBranch: "feat", targetBranch: "develop" },
    );
    const body = received[0].body as Record<string, unknown>;
    expect(body.prRefs).toBeUndefined();
  });
});

describe("syncDecision", () => {
  it("/api/sync/decision으로 Spec을 ADR wire(id/title=name)로 보낸다", async () => {
    await syncDecision("ws1", { name: "인증 방식", type: "architecture", tags: [], content: "JWT", created_at: "t" });
    expect(received[0].path).toBe("/api/sync/decision");
    const body = received[0].body as Record<string, unknown>;
    expect(body.id).toBe("인증 방식");
    expect(body.title).toBe("인증 방식");
    expect(body.content).toBe("JWT");
    expect(body.spec).toBeUndefined();
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
