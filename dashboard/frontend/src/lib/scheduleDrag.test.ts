import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeScheduleDrag, encodeScheduleDrag } from "./scheduleDrag.js";

describe("schedule drag payload", () => {
  it("달력에 이미 등록된 카드도 draggable이고 기한 미정 영역도 drop target이다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    const calendarCards = source.slice(source.indexOf("dayChips.map"), source.indexOf("{loading &&"));
    expect(calendarCards).toContain("draggable");
    expect(calendarCards).toContain("onDragStart");
    expect(source).toContain('onDrop={(e) => panelMode === "backlog" && dropScheduleItem(e, null)}');
  });

  it("날짜가 있는 Spec도 워크스페이스와 id를 잃지 않고 이동한다", () => {
    const encoded = encodeScheduleDrag({ kind: "spec", workspaceName: "checkout::service", id: "spec-23" });
    expect(decodeScheduleDrag(encoded)).toEqual({ kind: "spec", workspaceName: "checkout::service", id: "spec-23" });
    expect(decodeScheduleDrag(encodeScheduleDrag({ kind: "commitment", id: "commitment-1" }))).toEqual({ kind: "commitment", id: "commitment-1" });
    expect(decodeScheduleDrag(encodeScheduleDrag({ kind: "memo", id: "memo-1" }))).toEqual({ kind: "memo", id: "memo-1" });
  });

  it("깨진 외부 drag payload는 무시한다", () => {
    expect(decodeScheduleDrag("not-json")).toBeNull();
    expect(decodeScheduleDrag('{"workspaceName":"x"}')).toBeNull();
  });
});
