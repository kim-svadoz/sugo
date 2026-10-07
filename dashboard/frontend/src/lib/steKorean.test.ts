import { describe, expect, it } from "vitest";
import { presentSteKorean } from "./steKorean.js";

describe("presentSteKorean", () => {
  it("기존 로컬 문단을 사실 변경 없이 한 문장씩 표시한다", () => {
    expect(presentSteKorean("구현을 완료했다. 테스트를 통과했다. 다음 단계는 배포 확인이다."))
      .toBe("구현을 완료했다.\n테스트를 통과했다.\n다음 단계는 배포 확인이다.");
  });

  it("Markdown 목록과 코드 블록 표시는 분해하지 않는다", () => {
    expect(presentSteKorean("- 첫 항목이다. 다음 설명이다.\n```ts\ncall.one(); call.two();\n```"))
      .toBe("- 첫 항목이다. 다음 설명이다.\n```ts\ncall.one(); call.two();\n```");
  });
});
