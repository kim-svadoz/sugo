import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_TIP, tipsForPath } from "./pageTips.js";
import { SIDEBAR_DESTINATIONS } from "./sidebarNavigation.js";

describe("tipsForPath", () => {
  it.each(SIDEBAR_DESTINATIONS.map((item) => [item.label, item.to]))("사이드바 %s(%s)는 기본 문구가 아닌 전용 팁을 받는다", (_label, path) => {
    expect(tipsForPath(path)).not.toContain(DEFAULT_PAGE_TIP);
    expect(tipsForPath(path).length).toBeGreaterThanOrEqual(2);
  });

  it("Integrations 화면의 실제 경로 /settings에서 연동 팁을 보여준다", () => {
    expect(tipsForPath("/settings").join(" ")).toContain("연동");
  });
});
