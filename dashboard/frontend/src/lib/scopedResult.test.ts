import { describe, expect, it } from "vitest";
import { resultForWorkspace } from "./scopedResult.js";

describe("workspace-scoped result", () => {
  it("다른 워크스페이스에서 만든 적용 결과는 노출하지 않는다", () => {
    const state = { workspace: "tmp-sugo-showcase", value: { conflicts: ["tmp-path"] } };
    expect(resultForWorkspace(state, "orders")).toBeNull();
    expect(resultForWorkspace(state, "tmp-sugo-showcase")).toEqual(state.value);
  });
});
