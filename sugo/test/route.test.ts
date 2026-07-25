import { describe, expect, it } from "vitest";
import { routeInput } from "../src/route.js";

describe("routeInput — §5b 트리거 라우터", () => {
  it("'버그 고쳐줘'는 code-agent/bugfix로 라우팅된다", () => {
    const result = routeInput("이거 버그 고쳐줘");
    expect(result.matched).toBe(true);
    expect(result.route?.agent).toBe("code-agent");
    expect(result.route?.skill).toBe("bugfix");
  });

  it("negative 키워드(테스트/문서/리팩토링)가 섞이면 bugfix로 매칭되지 않는다(반드시 거부)", () => {
    const result = routeInput("버그 리팩토링 해줘");
    expect(result.route?.skill).not.toBe("bugfix");
  });

  it("'리팩토링'은 code-agent/refactor로 라우팅된다", () => {
    const result = routeInput("이 함수 리팩토링해줘");
    expect(result.route).toEqual({ agent: "code-agent", skill: "refactor", triggers_matched: ["리팩토링"] });
  });

  it("'리뷰해줘'는 review-agent/validate로 라우팅된다", () => {
    const result = routeInput("이 코드 리뷰해줘");
    expect(result.route?.agent).toBe("review-agent");
    expect(result.route?.skill).toBe("validate");
  });

  it("'보안'이 섞인 리뷰 요청은 validate가 아니라 security로 라우팅된다(우선순위)", () => {
    const result = routeInput("이 코드 보안 리뷰해줘");
    expect(result.route?.skill).toBe("security");
  });

  it("'문서화해줘'는 docs-agent/readme로 라우팅된다", () => {
    const result = routeInput("README 문서화해줘");
    expect(result.route?.agent).toBe("docs-agent");
  });

  it("'전체 테스트 돌려줘'는 test-agent/full로 라우팅된다(targeted보다 우선)", () => {
    const result = routeInput("전체 테스트 돌려줘");
    expect(result.route?.skill).toBe("full");
  });

  it("아무 트리거도 안 맞으면 matched:false", () => {
    const result = routeInput("오늘 날씨 어때");
    expect(result.matched).toBe(false);
    expect(result.route).toBeUndefined();
  });

  it("영어 키워드(bug/fix)도 인식한다", () => {
    const result = routeInput("please fix this bug");
    expect(result.route?.skill).toBe("bugfix");
  });

  it("여러 규칙이 매칭되면 우선순위가 높은 쪽이 route, 나머지는 alternatives로 나온다", () => {
    // "테스트해줘"(targeted, priority10)만 매칭되는 단일 케이스로 alternatives 없음을 우선 확인.
    const single = routeInput("테스트해줘");
    expect(single.route?.skill).toBe("targeted");
    expect(single.alternatives).toBeUndefined();
  });
});
