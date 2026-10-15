import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldApplyHoverFocus } from "./interaction.js";

describe("canvas selection interaction", () => {
  it("정상 종료 SPEC은 폐기함과 분리된 보관함에서 복구한다", () => {
    const source = readFileSync(new URL("./RoadmapGraph.tsx", import.meta.url), "utf8");
    expect(source).toContain("보관함");
    expect(source).toContain('archive.reason === "closed"');
    expect(source).toContain("restoreScheduleSpec");
  });

  it("SPEC/RUN은 제목 헤더 클릭으로만 접고 캔버스 노드 더블클릭은 사용하지 않는다", () => {
    const source = readFileSync(new URL("./RoadmapGraph.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("onNodeDoubleClick=");
    expect(source).toContain('title={isBand ? undefined : `${isSpec ? "SPEC" : "RUN"} 접기`}');
  });

  it("Inspector가 열린 동안 hover focus를 중지해 선택 직후 깜빡임을 만들지 않는다", () => {
    expect(shouldApplyHoverFocus("spec-1", "spec-1")).toBe(false);
    expect(shouldApplyHoverFocus("run-1", "spec-1")).toBe(false);
  });

  it("선택이 없어도 hover 때문에 다른 카드가 꺼지지 않는다", () => {
    expect(shouldApplyHoverFocus("spec-1", null)).toBe(false);
    expect(shouldApplyHoverFocus(null, null)).toBe(false);
  });

  it("Canvas 원문 버튼은 제목 기반 ADR 검색 대신 Schedule과 같은 연결 SPEC 문서 뷰어를 연다", () => {
    const source = readFileSync(new URL("./RoadmapGraph.tsx", import.meta.url), "utf8");
    expect(source).toContain('import { SpecDocumentPanel } from "../SpecDocumentPanel.js"');
    expect(source).toContain("setSpecDocumentTarget(n)");
    expect(source).toContain("<SpecDocumentPanel");
    expect(source).not.toContain("getSpecContent");
  });

  it("하단 파일 뷰어가 Inspector를 덮어도 변경 파일 목록 끝까지 스크롤할 여백을 둔다", () => {
    const source = readFileSync(new URL("./RoadmapGraph.tsx", import.meta.url), "utf8");
    expect(source).toContain('fileViewer && !fileViewer.expanded && <div aria-hidden className="h-[max(43%,260px)] shrink-0" />');
  });
});
