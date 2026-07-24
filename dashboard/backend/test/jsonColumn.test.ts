import { describe, expect, it } from "vitest";
import { parseJsonArray, parseMaybeJson } from "../src/db/jsonColumn.js";

// Found by testing against a real local MySQL instance (2026-07-24, see
// docs/roadmap-progress.md): mysql2 auto-deserializes JSON columns into
// objects/arrays, while node:sqlite returns the raw TEXT string. Every
// service that reads a JSON column has to tolerate both shapes - these
// tests pin that contract down.
describe("parseMaybeJson", () => {
  it("parses a JSON string (sqlite shape)", () => {
    expect(parseMaybeJson('{"a":1}', null)).toEqual({ a: 1 });
  });

  it("반드시 지켜야: 이미 파싱된 값(mysql2 shape)을 그대로 통과시킨다", () => {
    const obj = { a: 1 };
    expect(parseMaybeJson(obj, null)).toBe(obj); // same reference, not re-parsed
  });

  it("null/undefined는 fallback을 반환한다", () => {
    expect(parseMaybeJson(null, "fallback")).toBe("fallback");
    expect(parseMaybeJson(undefined, "fallback")).toBe("fallback");
  });

  it("반드시 거부: 깨진 JSON 문자열은 예외 없이 fallback으로 떨어진다", () => {
    expect(parseMaybeJson("not json", "fallback")).toBe("fallback");
  });
});

describe("parseJsonArray", () => {
  it("parses a JSON array string (sqlite shape)", () => {
    expect(parseJsonArray("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("반드시 지켜야: 이미 파싱된 배열(mysql2 shape)을 그대로 통과시킨다", () => {
    expect(parseJsonArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("null/비배열은 빈 배열로 안전측 처리한다", () => {
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray('{"not":"an array"}')).toEqual([]);
    expect(parseJsonArray({ not: "an array" })).toEqual([]);
  });
});
