import { expect, it } from "vitest";
import { workflowStatus } from "./workflowStatus.js";
it("완료 생명주기와 검증 등급을 섞지 않는다", () => {
  const result = { report: { completionGrade: "unverified" } };
  expect(workflowStatus({ level: "task", status: "in_progress", work_result: result })).toBe("in_progress");
  expect(workflowStatus({ level: "task", status: "done", manual_status: "done", work_result: result })).toBe("done");
  expect(workflowStatus({ level: "task", status: "done", work_result: { report: { completionGrade: "verified_by_human" } } })).toBe("done");
  expect(workflowStatus({ level: "spec", status: "done", display_status: "verification" })).toBe("done");
});
