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
          workResult: {
            path: "/work-result-patch-v1.md",
            summary: "TTL 보강",
            report: { requirements: [{ id: "REQ-7", title: "TTL을 갱신한다", status: "done" }] },
          },
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
    expect(selected.node.title).toBe("Redis 만료 보강");
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
    expect(lineageSelection(chain.columns[0][1]).node.work_result).toBeNull();
  });

  it("계보 workResult에 files가 없어도 해당 차수 changedFiles를 복원한다", () => {
    const task = node({
      id: "task",
      work_result: { patchVersion: 1 },
      lineage: [
        { version: 0, changedFiles: ["src/Feat.java"], workResult: { path: "/work-result.md" } },
        { version: 1, changedFiles: ["src/Patch.java"], workResult: { path: "/work-result-patch-v1.md" } },
      ],
    });
    const [chain] = buildLineageChains([task]);

    expect(lineageSelection(chain.columns[0][0]).node.work_result).toEqual(expect.objectContaining({
      files: [{ path: "src/Feat.java", change: "modified", artifactTaskId: "task", artifactPatchVersion: 0 }],
    }));
    expect(lineageSelection(chain.columns[0][1]).node.work_result).toEqual(expect.objectContaining({
      files: [{ path: "src/Patch.java", change: "modified", artifactTaskId: "task", artifactPatchVersion: 1 }],
    }));
  });

  it("patch는 feat의 REQ를 복사하지 않고 patch report의 검증 항목만 사용한다", () => {
    const task = node({
      id: "task",
      lineage: [
        { version: 0, requirements: [{ id: "feat", title: "최초 기능", status: "done" }], workResult: { report: {} } },
        { version: 1, requirements: [{ id: "feat", title: "최초 기능", status: "done" }], workResult: { report: { requirements: [{ id: "patch", title: "충돌 해결", status: "done" }] } } },
        { version: 2, requirements: [{ id: "feat", title: "최초 기능", status: "done" }], workResult: { report: { requirements: [] } } },
      ],
    });
    const [chain] = buildLineageChains([task]);
    expect(lineageSelection(chain.columns[0][0]).reqs.map((req) => req.title)).toEqual(["최초 기능"]);
    expect(lineageSelection(chain.columns[0][1]).reqs.map((req) => req.title)).toEqual(["충돌 해결"]);
    expect(lineageSelection(chain.columns[0][2]).reqs).toEqual([]);
  });

  it("취소한 최신 patch만 폐기로 남기고 이전 완료 차수는 완료로 유지한다", () => {
    const task = node({
      id: "task",
      status: "in_progress",
      display_status: "done",
      runtime_assessment: {
        projectionSchemaVersion: 1,
        status: "cancelled",
        currentStage: "REVIEW_RUNNING",
        nextActions: [],
        recommendedAction: null,
        humanDecisionRequired: false,
        blockers: [],
        evidence: [],
      },
      lineage: [
        { version: 0, title: "최초 구현", workResult: { path: "/work-result.md" } },
        { version: 1, title: "캐시 보강", workResult: { path: "/work-result-patch-v1.md" } },
        { version: 2, title: "문서 선택 변경" },
      ],
    });

    const [chain] = buildLineageChains([task]);
    expect(chain.columns[0].map((item) => item.node.display_status)).toEqual(["done", "done", "dropped"]);
  });

  it("feat는 기능명을 유지하고 patch는 첫 REQ의 명사형 제목을 사용한다", () => {
    const task = node({
      id: "task",
      title: "검색 필터",
      lineage: [
        { version: 0, title: "검색 필터", workResult: { seed: "최초 검색 필터 구현" } },
        {
          version: 1,
          title: "검색 필터",
          workResult: { seed: "1차 patch: 최신 문서 조회와 정렬을 적용한다" },
          requirements: [{ title: "alias 조회와 최신 문서 선택 (TODO-SPEC 항목: h)" }],
        },
      ],
    });

    const [chain] = buildLineageChains([task]);
    expect(chain.columns[0].map((item) => item.title)).toEqual([
      "검색 필터",
      "alias 조회와 최신 문서 선택",
    ]);
  });

  it("긴 작업 지시는 차수 접두사만 제거하고 상세 패널용 전체 제목을 보존한다", () => {
    const fullTitle = "2차 patch: 필터 종류가 늘어도 요청마다 필터 1개를 조회하도록 미리 대비한다.";
    const task = node({
      id: "task",
      title: "검색 필터",
      lineage: [{ version: 0, title: "최초 구현" }, { version: 2, title: fullTitle }],
    });

    const [chain] = buildLineageChains([task]);
    const selected = lineageSelection(chain.columns[0][1]);
    expect(selected.node.title).toBe("필터 종류가 늘어도 요청마다 필터 1개를 조회하도록 미리 대비한다.");
    expect(selected.node.title.endsWith("…")).toBe(false);
  });
});
