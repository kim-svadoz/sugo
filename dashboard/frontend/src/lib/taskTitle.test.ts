import { describe, expect, it } from "vitest";
import { resolveTaskTitle } from "./taskTitle.js";

const specs = [
  { id: "spec-order", workspace_name: "shop", project_path: "/repos/order-api", title: "주문 목록 무한 스크롤", development_history: [
    { task_id: "task-1", version: 0, title: "order-scroll", work_result_path: null },
    { task_id: "task-1", version: 1, title: "2차 확장", work_result_path: "/p/sugo/features/20261001/order-scroll/work-result-patch-v1.md" },
    { task_id: "task-1", version: 2, title: "정렬 수정", work_result_path: "/p/sugo/features/20261001/order-scroll/work-result-patch-v2.md" },
  ] },
  { id: "spec-search", workspace_name: "shop", project_path: "/repos/search-api", title: "검색 필터 저장", development_history: [
    { task_id: "task-2", version: 0, title: "검색 필터 저장", work_result_path: "/p/sugo/features/20261002/search-filter/work-result.md" },
  ] },
];

describe("resolveTaskTitle", () => {
  it("작업 ID로 일정 제목과 최신 차수를 찾는다", () => {
    expect(resolveTaskTitle({ workspace: "shop", taskId: "task-1", name: "order-scroll" }, specs)).toEqual({ title: "주문 목록 무한 스크롤", kind: "PATCH 2", project: "order-api", linked: true });
  });

  it("작업 ID가 없는 옛 이벤트는 작업 이름을 FEAT 제목이나 결과 폴더 이름과 맞춘다", () => {
    expect(resolveTaskTitle({ workspace: "shop", name: "order-scroll" }, specs)).toEqual({ title: "주문 목록 무한 스크롤", kind: "PATCH 2", project: "order-api", linked: true });
    expect(resolveTaskTitle({ workspace: "shop", name: "search-filter" }, specs)).toEqual({ title: "검색 필터 저장", kind: "FEAT", project: "search-api", linked: true });
  });

  it("찾지 못하면 작업 이름을 그대로 쓰고 차수는 비운다", () => {
    expect(resolveTaskTitle({ workspace: "shop", name: "unknown-task" }, specs)).toEqual({ title: "unknown-task", kind: null, project: null, linked: false });
    expect(resolveTaskTitle({ workspace: "other", taskId: "task-1", name: "order-scroll" }, specs)).toEqual({ title: "order-scroll", kind: null, project: null, linked: false });
  });

  it("spec ID가 있으면 표시 이름 추측보다 우선한다", () => {
    expect(resolveTaskTitle({ workspace: "wrong", specId: "spec-search", name: "같은 이름" }, specs)).toMatchObject({ title: "검색 필터 저장", kind: "FEAT", project: "search-api", linked: true });
  });
});
