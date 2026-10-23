import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/Playbook.tsx", import.meta.url), "utf8");

describe("Playbook product lifecycle", () => {
  it("사용자의 AI 개발 가치 흐름을 여섯 단계로 안내한다", () => {
    for (const label of ["기획을 기능 명세로", "팀의 판단을 규칙으로", "작업 단계 통제", "근거를 보고 판단", "후속 변경 잇기", "Console로 운영 확인"]) {
      expect(source).toContain(`label: "${label}"`);
    }
  });

  it("Claude와 Codex의 공통 규칙 및 SPEC의 사용자 가치를 명시한다", () => {
    expect(source).toContain("세션과 AI 도구가 바뀌어도 같은 판단 기준을 적용합니다.");
    expect(source).toContain("기획과 현재 제품의 차이");
  });

  it("승인보다 근거를 먼저 제시하고 개발부터 배포까지 구분한다", () => {
    expect(source).toContain("검토 완료 조건");
    expect(source).toContain("사용자가 판단할 수 있는 상태");
    expect(source).toContain("개발 절차 완료, Git 전송, 실제 배포 완료");
    expect(source).toContain("코드 작성이 끝난 시점과 사용자가 기능을 받는 시점");
  });

  it("Schedule SPEC에서 시작하는 최신 FEAT 파이프라인과 단계별 신뢰 장치를 설명한다", () => {
    for (const step of ["개발 일정 작성", "SPEC 확정", "FEAT 준비", "계약 테스트", "구현", "테스트", "독립 검토", "사용자 확인", "문서와 커밋"]) {
      expect(source).toContain(`name: "${step}"`);
    }
    expect(source).toContain("프로젝트 파악 · 요구사항 확정 · 기준 상태 확인");
    expect(source).toContain("메인 에이전트가 PRD와 요구사항을 정리");
    expect(source).toContain("저장된 실행 증거와 실제 결과를 비교합니다.");
    expect(source).toContain("통과 조건이 없으면 다음 단계로 이동하지 않습니다.");
    expect(source).toContain("테스트나 검토에서 문제가 나오면 구현 단계로 돌아갑니다.");
    for (const agent of ["code-agent", "test-agent", "review-agent", "docs-agent"]) {
      expect(source).toContain(`id: "${agent}"`);
    }
    expect(source).toContain("각 단계는 별도의 AI 에이전트가 실행합니다.");
    expect(source).toContain("작업 결과와 실행 증거를 다음 에이전트에 인계합니다.");
  });

  it("완료 결과에서 PATCH를 시작하거나 기존 작업 기록을 이어 붙이는 방법을 안내한다", () => {
    expect(source).toContain("새 Patch 시작");
    expect(source).toContain("작업 기록 이어붙이기");
    expect(source).toContain("이미 끝낸 변경을 같은 개발 이력에 연결");
    expect(source).toContain("일정 관리");
  });

  it("Console 기능이 답하는 운영 질문과 효과를 설명한다", () => {
    for (const feature of ["일정", "AI 작업 현황", "검토 보고서", "개발 이력", "배포 상태"]) {
      expect(source).toContain(`name: "${feature}"`);
    }
    expect(source).toContain("지금 무엇을 해야 하는가?");
    expect(source).toContain("무엇을 근거로 승인할 수 있는가?");
  });

  it("탭과 패널의 접근성 관계를 제공한다", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-selected={selected}");
  });

  it("사용 목적에서 바로 관련 사용 시나리오를 열 수 있다", () => {
    expect(source).toContain("지금 무엇을 하려 하나요?");
    expect(source).toContain("PLAYBOOK_INTENTS");
    expect(source).toContain("setActiveId(intent.stage)");
  });

  it("첫 개발 일정을 일정 작성 화면에서 바로 시작한다", () => {
    expect(source).toContain("첫 개발 일정 만들기");
    expect(source).toContain('/schedule?create=1');
    expect(source).not.toContain("기능 안내");
  });
});
