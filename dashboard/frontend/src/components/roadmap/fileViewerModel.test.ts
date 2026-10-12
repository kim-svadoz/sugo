import { describe, expect, it } from "vitest";
import { diffChangeRegions, filesForRoadmapScope, fileViewerLanguage, fileViewerPresentation, fileViewerText } from "./fileViewerModel.js";
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

  it("unified diff의 변경 구간을 hunk 단위로 찾는다", () => {
    expect(diffChangeRegions(["diff --git a/a b/a", "@@ -1 +1 @@", "-old", "+new", "@@ -20 +20 @@", "-x", "+y"])).toEqual([1, 4]);
  });

  it("hunk 헤더가 없는 추가 파일도 첫 변경 줄로 이동한다", () => {
    expect(diffChangeRegions(["plain", "+added", "+next"])).toEqual([1]);
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
