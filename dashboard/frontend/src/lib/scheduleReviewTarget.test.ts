import { describe, expect, it } from "vitest";
import { findScheduleReviewTarget } from "./scheduleReviewTarget.js";

describe("findScheduleReviewTarget", () => {
  const specs = [
    { id: "spec-a", workspace_name: "workspace-a", needsAttention: true },
    { id: "spec-b", workspace_name: "workspace-a", needsAttention: false },
    { id: "spec-c", workspace_name: "workspace-b", needsAttention: false },
  ];

  it("같은 워크스페이스 안에서도 전달받은 SPEC id를 정확히 연다", () => {
    expect(findScheduleReviewTarget(specs, "workspace-a", "spec-b", (spec) => spec.needsAttention)?.id).toBe("spec-b");
  });

  it("기존 workspace 전용 링크는 확인이 필요한 SPEC을 우선한다", () => {
    expect(findScheduleReviewTarget(specs, "workspace-a", null, (spec) => spec.needsAttention)?.id).toBe("spec-a");
  });
});
