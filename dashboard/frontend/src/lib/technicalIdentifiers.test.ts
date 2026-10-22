import { describe, expect, it } from "vitest";
import { technicalIdentifierParts } from "./technicalIdentifiers.js";

describe("학습 리뷰 코드 식별자 강조", () => {
  it("소스 식별자만 코드로 표시하고 환경명이나 일반 문장은 강조하지 않는다", () => {
    const parts = technicalIdentifierParts("DEV 응답을 유지하고 order_daily_summary과 findResult를 변경했다. STG 결과 75/75 통과.");
    expect(parts.filter((part) => part.code).map((part) => part.text)).toEqual(["order_daily_summary", "findResult"]);
    expect(parts.filter((part) => part.code).map((part) => part.text)).not.toEqual(expect.arrayContaining(["DEV", "STG", "75/75"]));
  });

  it("클래스명과 메서드 호출도 소스 식별자로 구분한다", () => {
    const parts = technicalIdentifierParts("OrderSummaryMapper의 findProducts(userId, size)를 재사용한다.");
    expect(parts.filter((part) => part.code).map((part) => part.text)).toEqual(["OrderSummaryMapper", "findProducts(userId, size)"]);
  });
});
