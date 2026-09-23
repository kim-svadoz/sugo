import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchCalibratedRatio, fetchCheckpointSync, fetchRoadmapOrdering, fetchUnlinkedSpecDrafts } from "../src/dashboard/fetch.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-dfetch-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.SUGO_DASHBOARD_API_URL;
  delete process.env.SUGO_DASHBOARD_USER_ID;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("fetch 계열 — disabled면 전부 null(블로킹 호출을 아예 시도 안 함)", () => {
  it("fetchRoadmapOrdering", async () => {
    expect(await fetchRoadmapOrdering("ws1")).toBeNull();
  });
  it("fetchCheckpointSync", async () => {
    expect(await fetchCheckpointSync()).toBeNull();
  });
  it("fetchCalibratedRatio", async () => {
    expect(await fetchCalibratedRatio()).toBeNull();
  });
});

describe("fetch 계열 — 실제 서버 응답", () => {
  let server: Server;
  let port: number;

  beforeEach(async () => {
    // 대시보드의 실제 응답 형태를 그대로 모사한다(roadmap URL, {nodes}/{checkpoints} 래핑, depends_on
    // snake_case) — seam 어댑터가 이걸 plugin의 camelCase로 정확히 번역하는지 검증한다.
    server = createServer((req, res) => {
      if (req.url?.startsWith("/api/workspaces/ws1/roadmap")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            nodes: [
              { id: "A", depends_on: ["B"], manual_status: "in_review", pos_x: 10, pos_y: 20, title: "A", level: "task", status: "pending" },
              { id: "spec-manual-open", title: "미연동 스펙", level: "spec", status: "pending", due_date: "2026-10-01" },
              { id: "spec-manual-linked", title: "연결된 스펙", level: "spec", status: "pending" },
              { id: "run-linked", title: "실행", level: "workstream", status: "pending", parent: "spec-manual-linked" },
              { id: "spec-manual-done", title: "끝난 스펙", level: "spec", status: "done" },
            ],
          }),
        );
      } else if (req.url?.startsWith("/api/workspaces/checkpoint-sync")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ checkpoints: [{ id: "CP-1", title: "원격 체크포인트", checklist: ["x"], applies_to: null, category: null }] }));
      } else if (req.url === "/api/metrics/calibrated-ratio") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ratio: 2.8 }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as { port: number }).port;
    process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${port}`;
    process.env.SUGO_DASHBOARD_USER_ID = "u1";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("fetchRoadmapOrdering이 대시보드 {nodes} 응답을 언랩하고 depends_on→dependsOn으로 매핑한다", async () => {
    const result = await fetchRoadmapOrdering("ws1");
    expect(result?.[0]).toEqual({ id: "A", dependsOn: ["B"], manual_status: "in_review", pos_x: 10, pos_y: 20 });
  });

  it("fetchCheckpointSync가 대시보드 {checkpoints} 응답을 언랩하고 applies_to를 매핑한다", async () => {
    const result = await fetchCheckpointSync();
    expect(result).toEqual([{ id: "CP-1", title: "원격 체크포인트", checklist: ["x"], applies_to: undefined, category: undefined }]);
  });

  it("하위 Run이 없는 진행 중 manual SPEC만 feat 연결 후보로 반환한다", async () => {
    expect(await fetchUnlinkedSpecDrafts("ws1")).toEqual([
      { id: "spec-manual-open", title: "미연동 스펙", dueDate: "2026-10-01" },
    ]);
  });

  it("fetchCalibratedRatio가 숫자를 가져온다", async () => {
    expect(await fetchCalibratedRatio()).toBe(2.8);
  });

  it("서버가 죽어있으면(타임아웃/에러) null로 안전 폴백한다(블로킹이어도 예외를 던지지 않음)", async () => {
    process.env.SUGO_DASHBOARD_API_URL = "http://127.0.0.1:9";
    expect(await fetchRoadmapOrdering("ws1")).toBeNull();
  });
});
