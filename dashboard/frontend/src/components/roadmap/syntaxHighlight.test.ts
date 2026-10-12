import { describe, expect, it } from "vitest";
import { tokenizeCodeLines } from "./syntaxHighlight.js";

describe("code viewer syntax highlighting", () => {
  it("Java 키워드·타입·애너테이션·문자열·숫자를 구분한다", () => {
    const [tokens] = tokenizeCodeLines(['@Override public String value = "item" + 42;'], "JAVA");

    expect(tokens).toEqual(expect.arrayContaining([
      { text: "@Override", kind: "annotation" },
      { text: "public", kind: "keyword" },
      { text: "String", kind: "type" },
      { text: '"item"', kind: "string" },
      { text: "42", kind: "number" },
    ]));
  });

  it("여러 줄 블록 주석 상태를 다음 줄까지 유지한다", () => {
    const lines = tokenizeCodeLines(["/* 설명", "계속 설명 */ public class Demo {}"], "JAVA");

    expect(lines[0]).toEqual([{ text: "/* 설명", kind: "comment" }]);
    expect(lines[1][0]).toEqual({ text: "계속 설명 */", kind: "comment" });
    expect(lines[1]).toContainEqual({ text: "public", kind: "keyword" });
    expect(lines[1]).toContainEqual({ text: "class", kind: "keyword" });
  });

  it("지원하지 않는 파일은 원문 토큰 하나로 유지한다", () => {
    expect(tokenizeCodeLines(["plain text"], "TEXT")).toEqual([[{ text: "plain text", kind: "plain" }]]);
  });
});
