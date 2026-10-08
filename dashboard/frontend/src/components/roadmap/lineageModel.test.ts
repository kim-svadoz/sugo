import { describe, expect, it } from "vitest";
import { buildLineageChains, lineageSelection } from "./lineageModel.js";
import type { RoadmapNode } from "../../hooks/useRoadmap.js";

const node = (overrides: Partial<RoadmapNode>): RoadmapNode => ({
  id: "node",
  title: "node",
  level: "task",
  status: "done",
  depends_on: [],
  parent: null,
  ref: null,
  note: null,
  spec_path: null,
  work_result: null,
  lineage: null,
  manual_status: null,
  pos_x: null,
  pos_y: null,
  ...overrides,
});

describe("patch lineage canvas model", () => {
  it("과거 REQ가 없으면 최신 차수 REQ를 그 당시 요구사항으로 대체하지 않는다", () => {
    const task = node({ id: "task", lineage: [{ version: 0 }, { version: 2 }] });
    const [chain] = buildLineageChains([task]);
    const selected = lineageSelection(chain.columns[0][0]);
    expect(selected.reqs).toEqual([]);
    expect(selected.requirementsUnavailable).toBe(true);
  });
  it("RUN의 lineage는 RUN 컨테이너를 대체하지 않는다", () => {
    const run = node({ id: "run", level: "workstream", lineage: [{ version: 0 }] });
    expect(buildLineageChains([run])).toEqual([]);
  });

  it("v0 feat만 있는 TASK는 계보가 아니라 일반 TASK 카드로 남긴다", () => {
    const task = node({
      id: "task",
      parent: "run",
      lineage: [{ version: 0, title: "최초 구현" }],
    });

    expect(buildLineageChains([task])).toEqual([]);
  });

  it("Task의 이력 배열을 원본 RUN 아래 v0→v1→v2 체인으로 펼친다", () => {
    const task = node({
      id: "task",
      title: "중복 결제 차단",
      parent: "run",
      status: "verification",
      work_result: { patchVersion: 2 },
      lineage: [
        { version: "0", title: "최초 구현" },
        {
          version: 1,
          title: "Redis 만료 보강",
          summary: "TTL 보강",
          workResult: { path: "/work-result-patch-v1.md", summary: "TTL 보강" },
          requirements: [{ id: "REQ-7", title: "TTL을 갱신한다", status: "done" }],
        },
        { version: 2, title: "동시성 패치" },
      ],
    });
    const [chain] = buildLineageChains([task]);
    expect(chain.parent).toBe("run");
    expect(chain.memberIds).toEqual(["task"]);
    expect(chain.columns).toHaveLength(1);
    expect(chain.columns[0].map((item) => [item.version, item.title])).toEqual([
      [0, "최초 구현"],
      [1, "Redis 만료 보강"],
      [2, "동시성 패치"],
    ]);
    expect(chain.columns[0].map((item) => item.node.status)).toEqual(["done", "done", "verification"]);

    const selected = lineageSelection(chain.columns[0][1]);
    expect(selected.node.id).toBe("task:v1");
    expect(selected.node.title).toBe("v1 patch · Redis 만료 보강");
    expect(selected.node.ref).toBe("task");
    expect(selected.node.approval_read_only).toBe(true);
    expect(selected.node.work_result).toEqual(expect.objectContaining({ path: "/work-result-patch-v1.md" }));
    expect(selected.reqs.map((req) => req.title)).toEqual(["TTL을 갱신한다"]);
  });

  it("진행 중 patch에서도 feat 카드는 완료 상태로 남는다", () => {
    const task = node({
      id: "task",
      status: "in_progress",
      lineage: [{ version: 0, title: "최초 feat" }, { version: 1, title: "진행 patch" }],
    });
    const [chain] = buildLineageChains([task]);
    expect(chain.columns[0].map((item) => item.node.status)).toEqual(["done", "in_progress"]);
  });
});
