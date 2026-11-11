import { describe, expect, it } from "vitest";
import { buildCoverageMapDraft } from "../src/coverageDraft.js";

describe("buildCoverageMapDraft", () => {
  it("완료조건 REQ 태그와 계약·테스트 클래스 근거를 모으되 충족 판정은 만들지 않는다", () => {
    const draft = buildCoverageMapDraft({
      prd: [
        "## 요구사항",
        "### REQ-1: 로그인",
        "### REQ-2: 로그아웃",
        "## 완료조건",
        "- 로그인 요청이 성공한다. (REQ-1)",
        "- 세션이 제거된다. (REQ-2)",
      ].join("\n"),
      contracts: [{ contractId: "REQ-1", greenExitCode: 0 }],
      testClasses: ["LoginFlowTest (REQ-1)", "LogoutApiTest (REQ-2)"],
    });

    expect(draft.acceptanceCriteria).toEqual([
      { id: "REQ-1", evidence: ["완료조건: 로그인 요청이 성공한다.", "계약 테스트: REQ-1", "테스트 클래스: LoginFlowTest (REQ-1)"] },
      { id: "REQ-2", evidence: ["완료조건: 세션이 제거된다.", "테스트 클래스: LogoutApiTest (REQ-2)"] },
    ]);
    expect(JSON.stringify(draft)).not.toContain('"covered":true');
  });

  it("완료조건 밖의 REQ와 실패한 계약은 충족 근거로 확대하지 않는다", () => {
    const draft = buildCoverageMapDraft({
      prd: "### REQ-1: 로그인\n## 완료조건\n- 로그인한다. (REQ-1)",
      contracts: [{ contractId: "REQ-2", greenExitCode: 1 }],
      testClasses: ["UnrelatedTest"],
    });
    expect(draft.acceptanceCriteria).toEqual([{ id: "REQ-1", evidence: ["완료조건: 로그인한다."] }]);
  });
});
