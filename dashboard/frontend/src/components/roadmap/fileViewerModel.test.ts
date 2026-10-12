import { describe, expect, it } from "vitest";
import { diffChangeRegions, filesForRoadmapScope, fileViewerLanguage, fileViewerLines, fileViewerPresentation, fileViewerText, nextDiffRegionIndex } from "./fileViewerModel.js";
import type { RoadmapNode } from "../../hooks/useRoadmap.js";

const node = (id: string, level: string, parent: string | null, files: Array<{ path: string; content: string }> = []): RoadmapNode => ({
  id,
  title: id,
  level,
  status: "done",
  depends_on: [],
  parent,
  ref: null,
  note: null,
  spec_path: null,
  work_result: files.length ? { files: files.map((file) => ({ ...file, change: "modified" as const })) } : null,
  lineage: null,
  manual_status: null,
  pos_x: null,
  pos_y: null,
});

describe("changed-file viewer model", () => {
  it("수정 파일은 실제 변경을 검토할 수 있도록 diff를 우선 보여준다", () => {
    expect(fileViewerText({ path: "src/a.ts", change: "modified", content: "new", diff: "@@ -1 +1 @@" })).toBe(
      "@@ -1 +1 @@",
    );
  });

  it("diff가 없으면 저장된 파일 내용을 보여준다", () => {
    expect(fileViewerText({ path: "src/a.ts", change: "added", content: "export const a = 1;" })).toBe(
      "export const a = 1;",
    );
  });

  it("내용도 diff도 없으면 명시적인 안내를 보여준다", () => {
    expect(fileViewerText({ path: "src/a.ts", change: "deleted" })).toContain("저장된 diff/content가 없습니다");
  });

  it("파일 확장자로 바텀시트 언어 라벨을 만든다", () => {
    expect(fileViewerLanguage("src/main/App.tsx")).toBe("TSX");
    expect(fileViewerLanguage("buildspec.yml")).toBe("YAML");
  });

  it("하나의 hunk 안에서도 떨어진 실제 변경 묶음을 각각 찾는다", () => {
    expect(diffChangeRegions([" context", "-old", "+new", " context", " context", "-later", "+later"])).toEqual([1, 5]);
  });

  it("삭제와 추가가 연속된 교체는 하나의 변경 묶음으로 센다", () => {
    expect(diffChangeRegions(["-old", "+new", "+next", " context", "-later"])).toEqual([0, 4]);
  });

  it("마지막 변경에서 다음을 눌러도 처음으로 순환하지 않는다", () => {
    expect(nextDiffRegionIndex(6, 1, 7)).toBe(6);
    expect(nextDiffRegionIndex(0, -1, 7)).toBe(0);
  });

  it("diff 메타데이터와 hunk 헤더는 코드 화면에서 제거한다", () => {
    expect(fileViewerLines({
      path: "src/a.ts",
      change: "modified",
      diff: "diff --git a/src/a.ts b/src/a.ts\nindex abc..def 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,3 @@\n context\n-old\n+new",
    })).toEqual([" context", "-old", "+new"]);
  });

  it("SPEC을 선택하면 모든 하위 RUN/TASK의 변경 파일을 모은다", () => {
    const nodes = [
      node("spec", "spec", null),
      node("run-a", "workstream", "spec"),
      node("task-a", "task", "run-a", [{ path: "src/A.java", content: "old" }]),
      node("run-b", "workstream", "spec"),
      node("task-b", "task", "run-b", [
        { path: "src/A.java", content: "latest" },
        { path: "README.md", content: "# Guide" },
      ]),
    ];

    expect(filesForRoadmapScope(nodes[0], nodes)).toEqual([
      expect.objectContaining({ path: "src/A.java", content: "latest" }),
      expect.objectContaining({ path: "README.md", content: "# Guide" }),
    ]);
  });

  it("파일 성격에 맞는 뷰어 템플릿을 고른다", () => {
    expect(fileViewerPresentation("src/payment/CheckoutController.java").kind).toBe("code");
    expect(fileViewerPresentation("src/payment/CheckoutControllerTest.java").kind).toBe("test");
    expect(fileViewerPresentation("application.yml").kind).toBe("config");
    expect(fileViewerPresentation("README.md").kind).toBe("document");
    expect(fileViewerPresentation("schema.sql").kind).toBe("data");
  });
});
