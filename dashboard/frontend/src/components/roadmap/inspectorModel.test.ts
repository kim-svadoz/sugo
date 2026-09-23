import { describe, expect, it } from "vitest";
import { inspectorProgress } from "./inspectorModel.js";

describe("Inspector progress", () => {
  it("SPEC/RUN은 없는 REQ 0/0 대신 직계 실행 단위 완료율을 보여준다", () => {
    expect(
      inspectorProgress(
        { level: "spec" },
        [
          { status: "done" },
          { status: "in_progress" },
        ],
      ),
    ).toEqual({ label: "RUN", done: 1, total: 2 });
    expect(inspectorProgress({ level: "workstream" }, [{ status: "done" }])).toEqual({ label: "TASK", done: 1, total: 1 });
  });

  it("TASK는 REQ 진행률을 유지한다", () => {
    expect(inspectorProgress({ level: "task" }, [{ status: "done" }, { status: "pending" }])).toEqual({
      label: "REQ",
      done: 1,
      total: 2,
    });
  });
});
