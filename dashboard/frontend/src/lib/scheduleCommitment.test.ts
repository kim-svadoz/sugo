import { describe, expect, it } from "vitest";
import { buildCommitmentQueue, commitmentNextAction, legacyCommitments } from "./scheduleCommitment.js";

describe("Schedule commitments", () => {
  const item = (overrides: Record<string, unknown> = {}) => ({
    id: "commitment-1",
    spec_id: "spec-1",
    workspace_name: "orders",
    title: "PRD 배포",
    due_date: "2026-10-16",
    state: "planned" as const,
    target: "prd" as const,
    linked_run_id: null,
    completed_at: null,
    completed_by: null,
    created_at: "2026-10-14T00:00:00.000Z",
    updated_at: "2026-10-14T00:00:00.000Z",
    ...overrides,
  });

  it("keeps pipeline completion visible until the commitment itself is closed", () => {
    const queue = buildCommitmentQueue([
      item({ id: "pipeline-done", pipeline_status: "done" }),
      item({ id: "closed", state: "completed", pipeline_status: "done" }),
    ], "2026-10-14");

    expect(queue.flatMap((group) => group.items.map((entry) => entry.id))).toEqual(["pipeline-done"]);
    expect(commitmentNextAction(item({ pipeline_status: "done", target: "prd", current_environment: "LOCAL" }))).toEqual({
      label: "PRD 배포",
      detail: "현재 LOCAL · PRD 반영 후 자동으로 다음 단계가 표시됩니다.",
    });
  });

  it("separates undated planning inbox items from the dated action queue", () => {
    const queue = buildCommitmentQueue([
      item({ id: "inbox", due_date: null }),
      item({ id: "late", due_date: "2026-10-13" }),
      item({ id: "today", due_date: "2026-10-14" }),
    ], "2026-10-14");

    expect(queue.map((group) => [group.id, group.items.map((entry) => entry.id)])).toEqual([
      ["overdue", ["late"]],
      ["today", ["today"]],
      ["inbox", ["inbox"]],
    ]);
  });

  it("adapts legacy specs without treating task done as commitment completed", () => {
    const [adapted] = legacyCommitments([{
      id: "spec-1",
      workspace_name: "orders",
      title: "검색 필터",
      due_date: "2026-10-14",
      status: "done",
      project_path: null,
      spec_path: null,
      has_run: true,
    }]);

    expect(adapted).toMatchObject({
      id: "legacy:orders:spec-1",
      spec_id: "spec-1",
      state: "active",
      pipeline_status: "done",
    });
  });

  it("only explicit commitment state closes work after the deployment target is reached", () => {
    expect(commitmentNextAction(item({
      state: "active",
      pipeline_status: "done",
      target: "prd",
      current_environment: "PRD",
    }))).toEqual({
      label: "일정 닫기",
      detail: "목표 PRD까지 반영되었습니다. 이 마감 일정을 Agenda에서 닫을 수 있습니다.",
    });

    const queue = buildCommitmentQueue([
      item({ id: "active-at-target", state: "active", pipeline_status: "done", current_environment: "PRD" }),
      item({ id: "completed-at-target", state: "completed", pipeline_status: "done", current_environment: "PRD" }),
      item({ id: "cancelled", state: "cancelled" }),
    ], "2026-10-14");
    expect(queue.flatMap((group) => group.items.map((entry) => entry.id))).toEqual(["active-at-target"]);
  });

  it("keeps overdue active commitments regardless of pipeline completion", () => {
    const queue = buildCommitmentQueue([
      item({ id: "overdue-done-run", due_date: "2026-10-12", pipeline_status: "done" }),
    ], "2026-10-14");

    expect(queue.map((group) => [group.id, group.items.map((entry) => entry.id)])).toEqual([
      ["overdue", ["overdue-done-run"]],
    ]);
  });
});
