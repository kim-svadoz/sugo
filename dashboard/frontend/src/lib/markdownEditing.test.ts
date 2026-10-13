import { describe, expect, it } from "vitest";
import { applyMarkdownEnter, applyMarkdownTab, markdownForPreview } from "./markdownEditing.js";

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

  it("Enter는 Markdown 목록을 이어가고 빈 항목에서는 목록을 종료한다", () => {
    expect(applyMarkdownEnter("- 첫째", 4, 4)).toEqual({ value: "- 첫째\n- ", selectionStart: 7, selectionEnd: 7 });
    expect(applyMarkdownEnter("  9. 아홉", 7, 7)?.value).toBe("  9. 아홉\n  10. ");
    expect(applyMarkdownEnter("- [x] 완료", 8, 8)?.value).toBe("- [x] 완료\n- [ ] ");
    expect(applyMarkdownEnter("- ", 2, 2)).toEqual({ value: "", selectionStart: 0, selectionEnd: 0 });
    expect(applyMarkdownEnter("일반 문장", 5, 5)).toBeNull();
  });
});
