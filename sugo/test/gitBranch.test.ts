import { describe, expect, it } from "vitest";
import { featureBranchName } from "../src/gitBranch.js";

describe("featureBranchName — feature/* 패턴 판정", () => {
  it("feature/<이름>에서 이름만 뽑는다", () => {
    expect(featureBranchName("feature/abc")).toBe("abc");
  });

  it("슬래시가 여러 개면 첫 슬래시 뒤 전체를 이름으로 삼는다", () => {
    expect(featureBranchName("feature/abc/nested")).toBe("abc/nested");
  });

  it("패턴이 아니면 null", () => {
    expect(featureBranchName("main")).toBeNull();
    expect(featureBranchName("development")).toBeNull();
    expect(featureBranchName("feat/abc")).toBeNull(); // 약어는 매칭하지 않는다 — 정확히 "feature/"
  });

  it("null 입력은 null을 돌려준다", () => {
    expect(featureBranchName(null)).toBeNull();
  });

  it("빈 이름은 매칭하지 않는다", () => {
    expect(featureBranchName("feature/")).toBeNull();
  });
});
