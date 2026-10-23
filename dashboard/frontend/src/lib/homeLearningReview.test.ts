import { describe, expect, it } from "vitest";
import { selectLearningReviewNote } from "./homeLearningReview.js";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";

const history = (version: number, completedAt: string) => ({ task_id: `task-${version}`, version, title: `patch ${version}`, summary: "완료 요약", completed_at: completedAt });

describe("Home 학습 리뷰 대상", () => {
  it("축약된 이력보다 같은 차수의 전체 focus 보고서를 우선한다", () => {
    const spec = {
      id: "generic", workspace_name: "sample", title: "검색 개선", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      focus_task_work_result: { patchVersion: 2, report: { patchVersion: 2, summary: "전체 결과", designDecisions: ["기존 조회 경계를 재사용했다."], knownLimitations: ["운영 지표 확인이 남았다."] } },
      development_history: [{ ...history(2, "2026-10-21T01:00:00.000Z"), work_result: { patchVersion: 2, report: { patchVersion: 2, summary: "축약 결과", designDecisions: [], knownLimitations: [] } } }],
    } as ScheduledSpec;
    const note = selectLearningReviewNote([{ spec, history: spec.development_history![0] }]);
    expect(note?.decisions).toEqual(["기존 조회 경계를 재사용했다."]);
    expect(note?.improvements).toEqual(["운영 지표 확인이 남았다."]);
  });

  it("특정 업무 식별자 없이 보고서의 설계 판단을 범용 학습으로 보여준다", () => {
    const spec = {
      id: "generic", workspace_name: "sample", title: "검색 개선", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      development_history: [{ ...history(1, "2026-10-21T01:00:00.000Z"), work_result: { patchVersion: 1, report: { patchVersion: 1, summary: "완료", designDecisions: ["기존 저장소 경계를 재사용해 중복 변환을 제거했다."], knownLimitations: [] } } }],
    } as ScheduledSpec;
    const note = selectLearningReviewNote([{ spec, history: spec.development_history![0] }]);
    expect(note?.learnings).toEqual(["기존 저장소 경계를 재사용해 중복 변환을 제거했다."]);
  });

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

  it("원본 작업 결과를 그대로 펼치지 않고 리뷰할 핵심만 중복 없이 압축한다", () => {
    const spec = {
      id: "catalog-scroll", workspace_name: "catalog-service", title: "상품 목록 - 연속 로딩", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      focus_task_work_result: {
        path: "/private/work-result.json",
        patchVersion: 4,
        report: {
          patchVersion: 4,
          summary: "전용 인덱스를 적용했다. 조회 키를 정리했다. 운영 설정을 확인했다.",
          designDecisions: [
            "화면 식별자를 하드코딩하지 않고 layout_key로 분기한다.",
            "기존 캐시를 재사용하는 대신 인덱스별 캐시를 유지한다.",
            "화면 식별자를 하드코딩하지 않고 layout_key로 분기한다.",
            "운영과 같은 키 형식을 쓴다.",
          ],
          knownLimitations: ["운영 설정 확인이 필요하다.", "배포 후 지표 확인이 필요하다.", "문서를 갱신한다."],
          verification: { test: { command: "./gradlew clean check", state: "pass", total: 75, passed: 75 }, runtimeVerified: true, validationVerdict: "pass" },
        },
      },
      development_history: [history(4, "2026-10-21T01:00:00.000Z")],
    } as ScheduledSpec;

    const note = selectLearningReviewNote([{ spec, history: spec.development_history![0] }]);

    expect(note?.summary).toHaveLength(3);
    expect(note?.decisions).toHaveLength(2);
    expect(note?.improvements).toHaveLength(2);
    expect(note?.verification).not.toHaveProperty("command");
    expect(note).not.toHaveProperty("resultPath");
  });

  it("세미콜론으로 뭉친 변경 요약을 독립된 검토 항목으로 나눈다", () => {
    const spec = {
      id: "feed-cache", workspace_name: "sample-workspace", title: "피드 캐시 정리", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      development_history: [{ ...history(2, "2026-10-21T01:00:00.000Z"), work_result: { patchVersion: 2, report: { patchVersion: 2, summary: "신규 인덱스를 읽는다; 기존 조회는 유지한다; 미사용 API는 제거한다; 캐시 키는 사용자 ID를 쓴다", designDecisions: [], knownLimitations: [] } } }],
    } as ScheduledSpec;
    const note = selectLearningReviewNote([{ spec, history: spec.development_history![0] }]);
    expect(note?.summary).toHaveLength(4);
    expect(note?.decisions).toEqual(expect.arrayContaining([expect.stringContaining("유지"), expect.stringContaining("제거")]));
  });

  it("같은 날 같은 FEAT에서 완료한 patch를 하나의 리뷰로 병합하고 코드 학습을 남긴다", () => {
    const spec = {
      id: "catalog-scroll", workspace_name: "catalog-service", title: "상품 목록 - 연속 로딩", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      development_history: [
        { ...history(3, "2026-10-21T01:00:00.000Z"), work_result: { patchVersion: 3, report: { patchVersion: 3, summary: "조회 계약을 정리했다.", designDecisions: ["findProducts(userId, size) 하나로 합치고 LIMITED_RESULT는 제거한다."], knownLimitations: [] } } },
        { ...history(4, "2026-10-21T03:00:00.000Z"), work_result: { patchVersion: 4, report: { patchVersion: 4, summary: "문서 변환을 재사용했다.", designDecisions: ["ProductDocMapper를 수정 없이 재사용한다."], knownLimitations: [] } } },
      ],
    } as ScheduledSpec;

    const note = selectLearningReviewNote(spec.development_history!.map((entry) => ({ spec, history: entry })));

    expect(note?.patchVersions).toEqual([3, 4]);
    expect(note?.summary).toEqual(["조회 계약을 정리했다.", "문서 변환을 재사용했다."]);
    expect(note?.learnings).toEqual([
      "findProducts(userId, size) 하나로 합치고 LIMITED_RESULT는 제거한다.",
      "ProductDocMapper를 수정 없이 재사용한다.",
    ]);
  });

  it("검증 로그는 변경 목록에서 빼고 축약된 제거 문장은 의도가 드러나게 정제한다", () => {
    const spec = {
      id: "catalog-scroll", workspace_name: "catalog-service", title: "상품 목록 - 연속 로딩", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      development_history: [{ ...history(4, "2026-10-21T03:00:00.000Z"), work_result: { patchVersion: 4, report: { patchVersion: 4, summary: "개수 없는 조회와 LIMITED_RESULT는 제거; baseline 63/63, clean check 75/75(contextLoads 포함); 운영 시뮬레이터로 로컬 호출 확인", designDecisions: [], knownLimitations: [] } } }],
    } as ScheduledSpec;

    const note = selectLearningReviewNote([{ spec, history: spec.development_history![0] }]);

    expect(note?.summary).toEqual(["page_size 없이 호출하던 미사용 조회 경로와 LIMITED_RESULT 분기를 제거해, 조회 계약을 page_size 기준 하나로 단순화했다."]);
    expect(note?.summary.join(" ")).not.toMatch(/baseline|gradle|clean check|시뮬레이터/i);
  });

  it("정상 하네스·린트·검증 통과 보고는 학습 변경에서 제외하고 위반만 남긴다", () => {
    const spec = {
      id: "review-signal", workspace_name: "sample-workspace", title: "리뷰 신호 정리", status: "done", due_date: null, project_path: null, spec_path: null, has_run: true,
      development_history: [{ ...history(1, "2026-10-21T03:00:00.000Z"), work_result: { patchVersion: 1, report: { patchVersion: 1, summary: "sugo_validate verdict는 pass이고 경고는 없다. 린트 규칙을 준수했다. 하네스 규칙과 구현이 불일치해 수정이 필요하다.", designDecisions: [], knownLimitations: [] } } }],
    } as ScheduledSpec;

    const note = selectLearningReviewNote([{ spec, history: spec.development_history![0] }]);

    expect(note?.summary).toEqual(["하네스 규칙과 구현이 불일치해 수정이 필요하다."]);
  });
});
