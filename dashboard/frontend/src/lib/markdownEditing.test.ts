import { describe, expect, it } from "vitest";
import { applyMarkdownTab, markdownForPreview } from "./markdownEditing.js";

describe("Markdown 편집기 입력", () => {
  it("Tab과 Shift+Tab은 포커스를 빼앗지 않고 선택 줄을 들여쓰기/내어쓰기 한다", () => {
    expect(applyMarkdownTab("- 첫째\n- 둘째", 0, 9, false)).toEqual({
      value: "  - 첫째\n  - 둘째",
      selectionStart: 2,
      selectionEnd: 13,
    });
    expect(applyMarkdownTab("  - 첫째\n  - 둘째", 2, 13, true).value).toBe("- 첫째\n- 둘째");
  });

  it("구분선은 앞 문장을 Setext 제목으로 바꾸지 않도록 빈 줄을 보장한다", () => {
    expect(markdownForPreview("앞 문장\n---\n다음 문장")).toBe("앞 문장\n\n---\n다음 문장");
    expect(markdownForPreview("---\ntitle: 예시\n---\n본문")).toBe("---\ntitle: 예시\n---\n본문");
  });
});
