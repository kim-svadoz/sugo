import { describe, expect, it } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "../src/hulk/frontmatter.js";

describe("frontmatter round-trip", () => {
  it("meta + body를 직렬화했다가 그대로 복원한다", () => {
    const meta = { id: "CP-1", title: "체크포인트", applies_to: ["lang/typescript"], checklist: ["a", "b"] };
    const serialized = stringifyFrontmatter(meta, "본문 내용");
    const parsed = parseFrontmatter(serialized);
    expect(parsed.meta).toEqual(meta);
    expect(parsed.body).toBe("본문 내용");
  });

  it("frontmatter가 없는 콘텐츠는 meta 빈 객체, body는 원본 그대로", () => {
    const parsed = parseFrontmatter("그냥 텍스트");
    expect(parsed.meta).toEqual({});
    expect(parsed.body).toBe("그냥 텍스트");
  });

  it("body가 없어도 안전하게 처리한다", () => {
    const serialized = stringifyFrontmatter({ name: "x" });
    const parsed = parseFrontmatter(serialized);
    expect(parsed.meta).toEqual({ name: "x" });
    expect(parsed.body).toBe("");
  });
});
