import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("메모 저장 후 일정 위치", () => {
  it("메모를 열 때 달력 위치를 임의로 바꾸지 않는다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("function openMemo(memo: ScheduledMemo)");
    expect(source).not.toContain("if (memo.due_date) jumpToDate(memo.due_date)");
  });
});
