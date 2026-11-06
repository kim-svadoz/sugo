import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("BlockerDecisionPanel draft stability", () => {
  it("같은 서버 결정을 새 객체로 폴링해도 작성 중인 답변을 덮어쓰지 않는다", () => {
    const source = readFileSync(new URL("./BlockerDecisionPanel.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("[taskId, decision]");
    expect(source).toContain("decision?.response, decision?.answered_at");
  });

  it("저장 결과를 다시 받아도 첫 클릭의 성공 안내를 지우지 않는다", () => {
    const source = readFileSync(new URL("./BlockerDecisionPanel.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("}, [taskId, decision?.response, decision?.answered_at]);");
    expect(source).toContain("}, [taskId]);");
    expect(source).toContain("}, [decision?.response, decision?.answered_at]);");
  });
});
