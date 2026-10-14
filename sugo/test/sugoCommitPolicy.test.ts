import { describe, expect, it } from "vitest";
import { sanitizeCommitText } from "../src/tools/sugoCommit.js";

describe("sugo commit message policy", () => {
  it("Claude 공동저자 trailer를 커밋 본문에서 제거한다", () => {
    expect(sanitizeCommitText([
      "구현 이유를 설명한다.",
      "",
      "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
    ].join("\n"))).toBe("구현 이유를 설명한다.");
  });

  it("대소문자와 다른 AI 이름에도 같은 정책을 적용한다", () => {
    expect(sanitizeCommitText("본문\nco-authored-by: Example Bot <bot@example.com>\n후속 설명"))
      .toBe("본문\n후속 설명");
  });
});
