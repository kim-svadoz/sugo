import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { summarizeActivity } from "./activityPresentation.js";

const event = (id: number, agent: string, handoffTo: string | null, message: string, eventType = "HANDOFF"): ActivityEvent => ({
  id, workspace_name: "sample-workspace", ts: `2026-10-21 01:${String(id).padStart(2, "0")}:00.000`, level: "INFO", agent, handoff_to: handoffTo, event_type: eventType, message,
});

describe("워크스페이스 작업 신호", () => {
  it("반복 로그를 최근 결과와 단계 흐름으로 압축한다", () => {
    const summary = summarizeActivity([
      event(8, "MAIN", null, "인덱스 전환과 검증을 완료했다. 상세 근거", "COMPLETED"),
      event(7, "DOCS", "MAIN", "infinite-scroll 완료 처리 인계"),
      event(6, "REVIEW", "DOCS", "infinite-scroll 문서화 인계"),
      event(5, "TEST", "REVIEW", "infinite-scroll 리뷰 인계"),
      event(4, "CODE", "TEST", "infinite-scroll 테스트 인계"),
      event(3, "REVIEW", "CODE", "infinite-scroll 구현 재진입"),
    ]);

    expect(summary.result).toEqual(["인덱스 전환과 검증을 완료했다.", "상세 근거"]);
    expect(summary.stages.map((stage) => stage.label)).toEqual(["구현", "테스트", "검토", "사용자 확인", "문서화", "커밋"]);
    expect(summary.stages.every((stage) => stage.status === "complete")).toBe(true);
    expect(summary.revisions).toBe(1);
  });

  it("내부 MAIN 명칭 대신 사용자가 이해할 수 있는 단계 설명을 제공한다", () => {
    const summary = summarizeActivity([
      event(2, "MAIN", null, "완료", "COMPLETED"),
      event(1, "DOCS", "MAIN", "완료 처리 인계"),
    ]);
    expect(summary.stages.find((stage) => stage.label === "사용자 확인")?.status).toBe("complete");
    expect(summary.stages.find((stage) => stage.label === "커밋")?.status).toBe("complete");
  });

  it("사용자 확인 요청에서 대기 중인 현재 단계를 강조한다", () => {
    const confirmation = { ...event(3, "REVIEW", null, "변경 파일 4개와 검증 결과를 확인해 주세요.", "SYSTEM"), details: { phase: "user_confirmation", status: "waiting" } };
    const summary = summarizeActivity([confirmation, event(2, "TEST", "REVIEW", "75/75 테스트 통과"), event(1, "CODE", "TEST", "4개 파일 구현 완료")]);
    expect(summary.stages.find((stage) => stage.label === "사용자 확인")?.status).toBe("active");
    expect(summary.currentLabel).toBe("사용자 확인 대기");
  });
});
