import { describe, expect, it } from "vitest";
import { orderVisibleCheckpoints } from "../components/CheckpointPanel.js";
import type { Checkpoint } from "../hooks/useWorkspaceData.js";

function checkpoint(id: string, expiresAt: string | null, appliesTo: string[] = []): Checkpoint {
  return {
    id,
    category: "general",
    title: id,
    learned_from: null,
    checklist: null,
    applies_to: appliesTo,
    checkpoint_date: `2026-10-${id === "no-expiry" ? "01" : "02"}`,
    expires_at: expiresAt,
    created_at: "2026-10-01T00:00:00.000Z",
  };
}

describe("Schedule 프로젝트 체크포인트 표시", () => {
  it("만료 항목을 숨기고 가까운 만료일 순으로 정렬하며 무기한을 마지막에 둔다", () => {
    const result = orderVisibleCheckpoints([
      checkpoint("no-expiry", null),
      checkpoint("later", "2026-10-20"),
      checkpoint("expired", "2026-10-06"),
      checkpoint("today", "2026-10-07"),
      checkpoint("soon", "2026-10-10"),
    ], "orders-api", "2026-10-07");

    expect(result.map((item) => item.id)).toEqual(["today", "soon", "later", "no-expiry"]);
  });

  it("다른 프로젝트 전용 항목을 숨기고 워크스페이스 공통 항목은 유지한다", () => {
    const result = orderVisibleCheckpoints([
      checkpoint("shared", "2026-10-08"),
      checkpoint("mine", "2026-10-09", ["orders-api"]),
      checkpoint("other", "2026-10-07", ["profile-api"]),
    ], "orders-api", "2026-10-07");

    expect(result.map((item) => item.id)).toEqual(["shared", "mine"]);
  });

  it("워크스페이스 체크포인트에는 유효기간이 없는 공통 규칙만 보여준다", () => {
    const result = orderVisibleCheckpoints([
      checkpoint("no-expiry", null),
      checkpoint("newer", "2026-10-20"),
      checkpoint("expired", "2026-10-01"),
    ], null, "2026-10-07");

    expect(result.map((item) => item.id)).toEqual(["no-expiry"]);
  });
});
