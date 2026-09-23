import { describe, expect, it } from "vitest";
import { fileViewerLanguage, fileViewerText } from "./fileViewerModel.js";

describe("changed-file viewer model", () => {
  it("전체 파일 content가 있으면 diff보다 우선 보여준다", () => {
    expect(fileViewerText({ path: "src/a.ts", change: "modified", content: "new", diff: "@@ -1 +1 @@" })).toBe(
      "new",
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
});
