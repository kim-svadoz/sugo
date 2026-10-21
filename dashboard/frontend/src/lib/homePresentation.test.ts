import { describe, expect, it } from "vitest";
import { buildHomeAttention, buildHomeBrief } from "./homePresentation.js";

const base = {
  workspace_name: "sample-workspace",
  status: "pending",
  has_run: true,
  spec_path: "spec.md",
  task_count: 1,
  done_task_count: 0,
  active_task_count: 1,
  blocked_task_count: 0,
  stale_task_count: 0,
  unverified_task_count: 0,
  focus_task_status: "in_progress",
};

describe("Home attention", () => {
  it("정상 진행 중인 Pipeline은 Attention에 올리지 않는다", () => {
    expect(buildHomeAttention([{ ...base, id: "s1", title: "정상 작업", due_date: "2026-10-30" }], new Date("2026-10-21T00:00:00Z"))).toEqual([]);
  });

  it("사람 확인과 D-2 이내 마감을 실제 작업 제목·이유와 함께 보여준다", () => {
    const items = buildHomeAttention([
      { ...base, id: "review", title: "검색 결과 페이지 개선", due_date: "2026-10-30", blocked_task_count: 1, focus_task_status: "blocked", focus_task_note: "검토 결정이 필요합니다." },
      { ...base, id: "later", title: "이틀 뒤 작업", due_date: "2026-10-23", has_run: false, active_task_count: 0, focus_task_status: null },
      { ...base, id: "due", title: "MAB 서빙영역 1차", due_date: "2026-10-22", has_run: false, active_task_count: 0, focus_task_status: null },
    ], new Date("2026-10-21T00:00:00Z"));

    expect(items.map(({ title, label }) => ({ title, label }))).toEqual([
      { title: "검색 결과 페이지 개선", label: "차단" },
      { title: "MAB 서빙영역 1차", label: "D-1" },
      { title: "이틀 뒤 작업", label: "D-2" },
    ]);
    expect(items[0]?.detail).toContain("검토 결정");
    expect(items[1]?.detail).toContain("2026-10-22");
  });

  it("파이프라인 완료 상태여도 보관하지 않은 D-2 SPEC은 보여준다", () => {
    const items = buildHomeAttention([
      { ...base, id: "done-soon", title: "배포 준비 작업", status: "done", due_date: "2026-10-23", done_task_count: 1, active_task_count: 0, focus_task_status: "done" },
    ], new Date("2026-10-21T00:00:00Z"));
    expect(items.map(({ title, label }) => ({ title, label }))).toEqual([{ title: "배포 준비 작업", label: "D-2" }]);
  });

  it("결정·마감·이어갈 작업을 서로 겹치지 않게 브리핑한다", () => {
    const brief = buildHomeBrief([
      { ...base, id: "review", title: "결정 필요", due_date: "2026-10-30", blocked_task_count: 1, focus_task_status: "blocked", focus_task_note: "검토 결정이 필요합니다." },
      { ...base, id: "due", title: "마감 확인", due_date: "2026-10-22", has_run: false, active_task_count: 0, focus_task_status: null },
      { ...base, id: "active", title: "계속 구현", due_date: "2026-10-30", focus_task_title: "API 구현", focus_task_updated_at: "2026-10-21T09:00:00.000Z" },
    ], new Date("2026-10-21T00:00:00Z"));

    expect(brief.decisions.map((item) => item.title)).toEqual(["결정 필요"]);
    expect(brief.deadlines.map((item) => item.title)).toEqual(["마감 확인"]);
    expect(brief.resume.map((item) => item.title)).toEqual(["계속 구현"]);
    expect(brief.resume[0]?.detail).toContain("API 구현");
  });
});
