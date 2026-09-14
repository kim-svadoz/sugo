import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fetchFromLocal, shouldSkipFetch } from "../src/harness/harnessFetcher.js";

const libraryDir = join(dirname(fileURLToPath(import.meta.url)), "..", "harness-library");

describe("fetchFromLocal", () => {
  it("실제 존재하는 harnessId를 정확히 로드한다", () => {
    const { harnesses, warnings } = fetchFromLocal(["lang/typescript", "framework/node"], libraryDir);
    const ids = harnesses.map((h) => h.id).sort();
    expect(ids).toEqual(["default", "framework/node", "lang/typescript"]);
    expect(warnings).toEqual([]);
    for (const h of harnesses) {
      expect(h.harnessMd.length).toBeGreaterThan(0);
      expect(h.validationYaml.length).toBeGreaterThan(0);
    }
  });

  it("콘텐츠가 있는 버전 접미사 id는 그 버전 하네스를 정확히 로드한다", () => {
    const { harnesses, warnings } = fetchFromLocal(["framework/spring", "framework/spring/3.x"], libraryDir);
    const ids = harnesses.map((h) => h.id).sort();
    expect(ids).toEqual(["default", "framework/spring", "framework/spring/3.x"].sort());
    expect(harnesses.every((h) => h.source === "local")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("콘텐츠가 없는 버전 접미사 id는 base id로 폴백하고 경고 없이 local로 처리한다", () => {
    // 아직 만들지 않은 미래 버전이 감지돼도 base 규칙은 적용돼야 한다(차단 아님).
    const { harnesses, warnings } = fetchFromLocal(["framework/spring/99.x"], libraryDir);
    const spring = harnesses.find((h) => h.id === "framework/spring");
    expect(spring).toBeDefined();
    expect(spring?.source).toBe("local");
    expect(warnings).toEqual([]);
  });

  it("존재하지 않는 id는 default로 폴백하며 경고를 남긴다", () => {
    const { harnesses, warnings } = fetchFromLocal(["totally/unknown-stack"], libraryDir);
    expect(harnesses.map((h) => h.id)).toEqual(["default"]);
    expect(harnesses[0].source).toBe("default-fallback");
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("totally/unknown-stack");
  });

  it("빈 harnessIds여도 default는 항상 포함한다", () => {
    const { harnesses, warnings } = fetchFromLocal([], libraryDir);
    expect(harnesses.map((h) => h.id)).toEqual(["default"]);
    expect(warnings).toEqual([]);
  });

  it("여러 id가 같은 폴백 대상으로 겹치면 중복 없이 하나만 남는다", () => {
    const { harnesses } = fetchFromLocal(["unknown/a", "unknown/b"], libraryDir);
    expect(harnesses.filter((h) => h.id === "default").length).toBe(1);
  });
});

describe("shouldSkipFetch (fetch 쿨다운 순수함수)", () => {
  it("이전 fetch 기록이 없으면 스킵하지 않는다", () => {
    expect(shouldSkipFetch(null, Date.now())).toBe(false);
  });

  it("쿨다운 이내면 스킵한다", () => {
    const now = Date.now();
    expect(shouldSkipFetch(now - 1000, now, 5 * 60 * 1000)).toBe(true);
  });

  it("쿨다운을 지났으면 스킵하지 않는다", () => {
    const now = Date.now();
    expect(shouldSkipFetch(now - 6 * 60 * 1000, now, 5 * 60 * 1000)).toBe(false);
  });
});
