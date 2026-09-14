import { describe, expect, it } from "vitest";
import type { HarnessValidationConfig } from "../src/harness/validationConfig.js";
import { computeValidationVerdict, type AutoVerifiedResult } from "../src/validate.js";

/** auto가 붙은 체크 2개 + 자기보고 체크 1개를 가진 하네스. */
const CONFIG: HarnessValidationConfig = {
  harnessId: "buildtool/gradle",
  checks: [
    {
      id: "wrapper-committed",
      description: "래퍼 커밋",
      severity: "error",
      auto: { kind: "file-exists", paths: ["gradlew"] },
    },
    {
      id: "version-centralized",
      description: "버전 중앙관리",
      severity: "warning",
      auto: null,
    },
    {
      id: "no-skip-tests",
      description: "테스트 스킵 금지",
      severity: "error",
      auto: { kind: "file-content-absent", paths: ["pom.xml"], pattern: /skipTests/ },
    },
  ],
};

const configs = new Map([["buildtool/gradle", CONFIG]]);

function auto(entries: Record<string, { passed: boolean; detail?: string }>): Map<string, AutoVerifiedResult> {
  return new Map(
    Object.entries(entries).map(([key, v]) => {
      const [harnessId, checkId] = key.split("#");
      return [key, { harnessId, checkId, passed: v.passed, detail: v.detail ?? "" }];
    }),
  );
}

describe("computeValidationVerdict — 실측이 자기보고를 이긴다", () => {
  it("통과했다고 주장해도 서버 실측이 실패면 fail이고 모순으로 기록된다", () => {
    const r = computeValidationVerdict(
      [{ harnessId: "buildtool/gradle", checkId: "wrapper-committed", passed: true }],
      configs,
      auto({ "buildtool/gradle#wrapper-committed": { passed: false, detail: "없는 파일: gradlew" } }),
    );

    expect(r.verdict).toBe("fail");
    const wrapper = r.results.find((x) => x.checkId === "wrapper-committed");
    expect(wrapper?.passed).toBe(false);
    expect(wrapper?.source).toBe("verified");
    expect(r.contradictions).toHaveLength(1);
    expect(r.contradictions[0].checkId).toBe("wrapper-committed");
  });

  it("아예 제출하지 않아도 서버가 돌려서 실패를 잡는다", () => {
    // "제출 안 하면 자동 pass"가 auto 체크에서는 성립하지 않는다 — 하드 게이트를 막던 바로 그 한계.
    const r = computeValidationVerdict(
      [],
      configs,
      auto({ "buildtool/gradle#wrapper-committed": { passed: false, detail: "없는 파일: gradlew" } }),
    );

    expect(r.verdict).toBe("fail");
    expect(r.results.find((x) => x.checkId === "wrapper-committed")?.source).toBe("verified");
  });

  it("실패했다고 주장해도 서버 실측이 통과면 통과로 본다(양방향 모두 실측 우선)", () => {
    const r = computeValidationVerdict(
      [{ harnessId: "buildtool/gradle", checkId: "wrapper-committed", passed: false }],
      configs,
      auto({ "buildtool/gradle#wrapper-committed": { passed: true, detail: "있음" } }),
    );

    expect(r.results.find((x) => x.checkId === "wrapper-committed")?.passed).toBe(true);
    expect(r.contradictions).toHaveLength(1);
  });

  it("주장과 실측이 일치하면 모순이 아니다", () => {
    const r = computeValidationVerdict(
      [{ harnessId: "buildtool/gradle", checkId: "wrapper-committed", passed: true }],
      configs,
      auto({ "buildtool/gradle#wrapper-committed": { passed: true, detail: "있음" } }),
    );
    expect(r.contradictions).toEqual([]);
  });
});

describe("computeValidationVerdict — 자기보고 체크는 기존과 동일하다", () => {
  it("auto 없는 체크는 제출된 값을 그대로 쓴다", () => {
    const r = computeValidationVerdict(
      [{ harnessId: "buildtool/gradle", checkId: "version-centralized", passed: false }],
      configs,
      auto({}),
    );
    const item = r.results.find((x) => x.checkId === "version-centralized");
    expect(item?.passed).toBe(false);
    expect(item?.source).toBe("self-reported");
    expect(r.verdict).toBe("partial"); // warning 실패
  });

  it("존재하지 않는 checkId는 여전히 fabricated로 분리된다", () => {
    const r = computeValidationVerdict(
      [{ harnessId: "buildtool/gradle", checkId: "존재안함", passed: true }],
      configs,
      auto({}),
    );
    expect(r.fabricated).toHaveLength(1);
    expect(r.results).toHaveLength(0);
  });
});

describe("computeValidationVerdict — uncoveredChecks", () => {
  it("auto 체크는 미제출이어도 uncovered가 아니다(서버가 항상 본다)", () => {
    const r = computeValidationVerdict(
      [],
      configs,
      auto({
        "buildtool/gradle#wrapper-committed": { passed: true },
        "buildtool/gradle#no-skip-tests": { passed: true },
      }),
    );
    const uncoveredIds = r.uncoveredChecks.map((u) => u.checkId);
    expect(uncoveredIds).not.toContain("wrapper-committed");
    expect(uncoveredIds).toContain("version-centralized"); // 자기보고인데 미제출 → uncovered
  });
});

describe("computeValidationVerdict — 하위호환", () => {
  it("autoResults 인자를 생략해도 기존처럼 동작한다", () => {
    const r = computeValidationVerdict(
      [{ harnessId: "buildtool/gradle", checkId: "version-centralized", passed: true }],
      configs,
    );
    expect(r.verdict).toBe("pass");
    expect(r.contradictions).toEqual([]);
  });
});
