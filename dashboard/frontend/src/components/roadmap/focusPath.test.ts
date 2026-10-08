import { describe, expect, it } from "vitest";
import { focusPathIds, focusRootId } from "./focusPath.js";

describe("focusPathIds", () => {
  it("keeps the selected task and its RUN/SPEC path, excluding unrelated runs", () => {
    const nodes = [
      { id: "spec", parent: null },
      { id: "run-a", parent: "spec" },
      { id: "task-a", parent: "run-a" },
      { id: "req-a", parent: "task-a" },
      { id: "run-b", parent: "spec" },
      { id: "task-b", parent: "run-b" },
    ];
    expect([...focusPathIds(nodes, "task-a")].sort()).toEqual(["req-a", "run-a", "spec", "task-a"]);
  });

  it("fits the outer SPEC container after Schedule deep-link expansion", () => {
    const nodes = [
      { id: "spec", parent: null },
      { id: "run", parent: "spec" },
      { id: "task", parent: "run" },
      { id: "req", parent: "task" },
    ];
    expect(focusRootId(nodes, "task")).toBe("spec");
  });
});
