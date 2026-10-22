import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

describe("schedule memo archive", () => {
  it("메모 삭제는 보관 처리하고 기존 보관함에서 복구한다", () => {
    const api = readFileSync(join(root, "api", "scheduleMemoApi.ts"), "utf8");
    const page = readFileSync(join(root, "pages", "SchedulePage.tsx"), "utf8");
    const modal = readFileSync(join(root, "components", "SpecArchiveModal.tsx"), "utf8");

    expect(api).toContain("getArchivedScheduleMemos");
    expect(api).toContain("restoreScheduleMemo");
    expect(page).toContain("memoArchives");
    expect(page).toContain("restoreScheduleMemo");
    expect(modal).toContain("보관된 메모");
    expect(modal).toContain("개발 일정");
    expect(modal).toContain('section === "memo"');
  });
});
