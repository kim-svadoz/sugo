import { describe, expect, it } from "vitest";
import { buildWorkResultReport, renderWorkResultMarkdown } from "../src/workResultReport.js";

describe("canonical work-result report", () => {
  it("세션 실행 증거를 표준 구조와 Markdown 골격으로 만든다", () => {
    const report = buildWorkResultReport({
      featureName: "결제 중복 방지",
      kind: "patch",
      patchVersion: 1,
      completedAt: "2026-09-28T08:00:00.000Z",
      completionGrade: "verified",
      summary: "중복 결제 요청을 멱등키로 차단하고 기존 승인 결과를 재사용한다.",
      changedFiles: ["src/CheckoutService.ts", "test/CheckoutService.test.ts"],
      designDecisions: ["멱등키 저장소는 기존 Redis 경계를 재사용한다."],
      knownLimitations: ["Redis 장애 폴백은 별도 patch에서 다룬다."],
      seed: "동시 요청도 차단해줘",
      testEvidence: { command: "npm test", exitCode: 0, total: 12, passed: 12, failed: 0, state: "pass" },
      runtimeVerified: true,
      wiringVerified: true,
      validation: { verdict: "pass", autoVerifiedCount: 3, contradictionCount: 0 },
      requirements: [{ id: "REQ-001", covered: true }],
    });

    expect(report).toMatchObject({ schemaVersion: 1, kind: "patch", patchVersion: 1, completionGrade: "verified" });
    expect(report.presentationProfile).toBe("ste-inspired-ko");
    expect(report.verification.test.command).toBe("npm test");
    expect(report.verification.runtimeVerified).toBe(true);

    const markdown = renderWorkResultMarkdown(report);
    expect(markdown).toContain("# Work Result — 결제 중복 방지");
    expect(markdown).toContain("## 결과 요약");
    expect(markdown).toContain("## 요구사항 충족");
    expect(markdown).toContain("## 주요 변경");
    expect(markdown).toContain("## 설계 결정");
    expect(markdown).toContain("## 검증");
    expect(markdown).toContain("`npm test`");
    expect(markdown).toContain("## 남은 사항 및 위험");
    expect(markdown).toContain("## 사용자 지시");
  });

  it("기존 사실을 바꾸지 않고 한 줄에 한 문장으로 정돈한다", () => {
    const report = buildWorkResultReport({
      featureName: "설명",
      kind: "feat",
      patchVersion: 0,
      completedAt: "2026-10-07T00:00:00.000Z",
      completionGrade: "verified",
      summary: "기능을 구현했다. 테스트를 통과했다. 다음 단계는 배포 확인이다.",
      changedFiles: [],
      designDecisions: ["기존 계약을 유지했다. 새 필드는 선택값으로 추가했다."],
      testEvidence: { state: "pass" },
      runtimeVerified: true,
    });
    expect(report.summary).toBe("기능을 구현했다.\n테스트를 통과했다.\n다음 단계는 배포 확인이다.");
    expect(report.designDecisions).toEqual(["기존 계약을 유지했다.\n새 필드는 선택값으로 추가했다."]);
  });

  it("선택 입력이 없어도 빈 섹션을 생략하지 않고 명시적으로 기록한다", () => {
    const report = buildWorkResultReport({
      featureName: "로그인",
      kind: "feat",
      patchVersion: 0,
      completedAt: "2026-09-28T08:00:00.000Z",
      completionGrade: "unverified",
      summary: "로그인 경로를 구현했다.",
      changedFiles: [],
      testEvidence: { command: "npm test", state: "unverified" },
      runtimeVerified: false,
    });
    const markdown = renderWorkResultMarkdown(report);
    expect(markdown).toContain("- 변경 파일 없음");
    expect(markdown).toContain("- 별도 설계 결정 기록 없음");
    expect(markdown).toContain("- 알려진 제한 사항 없음");
    expect(markdown).toContain("미검증");
  });
});
