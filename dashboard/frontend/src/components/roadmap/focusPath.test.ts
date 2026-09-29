import { describe, expect, it } from "vitest";
import { focusPathIds } from "./focusPath.js";

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
});
