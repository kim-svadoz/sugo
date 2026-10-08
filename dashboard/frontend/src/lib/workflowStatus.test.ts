import { expect, it } from "vitest";
import { workflowStatus } from "./workflowStatus.js";
it("미검증 완료를 사용자에게 검증 상태로 표시한다", () => {
  const result = { report: { completionGrade: "unverified" } };
  expect(workflowStatus({ level: "task", status: "in_progress", work_result: result })).toBe("in_progress");
  expect(workflowStatus({ level: "task", status: "done", manual_status: "done", work_result: result })).toBe("verification");
  expect(workflowStatus({ level: "task", status: "done", work_result: { report: { completionGrade: "verified_by_human" } } })).toBe("done");
  expect(workflowStatus({ level: "spec", status: "done", display_status: "verification" })).toBe("verification");
});
