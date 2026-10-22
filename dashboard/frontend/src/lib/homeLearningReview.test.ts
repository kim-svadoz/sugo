import { describe, expect, it } from "vitest";
import { selectLearningReviewNote } from "./homeLearningReview.js";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";

const history = (version: number, completedAt: string) => ({ task_id: `task-${version}`, version, title: `patch ${version}`, summary: "완료 요약", completed_at: completedAt });

describe("Home 학습 리뷰 대상", () => {
  it("전체 focus 갱신 시각이 아니라 어제의 작업과 같은 작업·같은 patch 결과를 선택한다", () => {
    const userProfile = {
      id: "notify-settings", workspace_name: "account", title: "알림 설정 분류", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      focus_task_updated_at: "2026-10-22T01:00:00.000Z",
      focus_task_work_result: { patchVersion: 1, report: { patchVersion: 1, designDecisions: ["다른 작업 결정"], knownLimitations: [], verification: { test: { state: "pass" } } } },
      development_history: [history(1, "2026-10-20T01:00:00.000Z")],
    } as ScheduledSpec;
    const infiniteScroll = {
      id: "catalog-scroll", workspace_name: "catalog-service", title: "상품 목록 - 연속 로딩", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      focus_task_title: "무한스크롤 order-scroll 인덱스 전환",
      focus_task_updated_at: "2026-10-21T01:00:00.000Z",
      focus_task_work_result: { patchVersion: 4, report: { patchVersion: 4, summary: "전용 인덱스를 적용했다.", designDecisions: ["화면 식별자를 하드코딩하지 않고 layout_key로 분기한다."], knownLimitations: ["운영 설정 확인이 필요하다."], verification: { test: { state: "pass", total: 75, passed: 75 }, runtimeVerified: true, validationVerdict: "pass" } } },
      development_history: [history(4, "2026-10-21T01:00:00.000Z")],
    } as ScheduledSpec;

    const note = selectLearningReviewNote([{ spec: infiniteScroll, history: infiniteScroll.development_history![0] }, { spec: userProfile, history: userProfile.development_history![0] }]);
    expect(note).toMatchObject({ workspace: "catalog-service", patchVersion: 4, workTitle: "상품 목록 - 연속 로딩" });
  });
});
