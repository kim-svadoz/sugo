import { expect, it } from "vitest";
import { completionReasonPresentation, reasonPreview } from "./completionReasonPresentation.js";
it("explains the missing check without inventing exclusions or accepting their safety", () => {
  const p = completionReasonPresentation("evidenceResnapshot");
  expect(p.title).toBe("테스트 재검증 기록 검토");
  expect(p.review).toContain("현재 코드");
  expect(p.meaning).not.toContain("코드와 무관");
  expect(completionReasonPresentation("new-label").title).toBe("검증 예외 기록 검토");
});
it("only quotes a bounded preview and retains a short reason exactly", () => {
  expect(reasonPreview("로컬 Redis 검증 제외")).toBe("로컬 Redis 검증 제외");
  expect(reasonPreview("가".repeat(200))).toBe("가".repeat(140) + "…");
});
