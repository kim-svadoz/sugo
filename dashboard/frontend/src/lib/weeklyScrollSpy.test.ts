import { describe, expect, it } from "vitest";
import { selectWeeklySection } from "./weeklyScrollSpy.js";

describe("selectWeeklySection", () => {
  const sections = [
    { id: "weekly-topic-0", top: -760, bottom: -24 },
    { id: "weekly-topic-1", top: 168, bottom: 840 },
    { id: "weekly-topic-2", top: 864, bottom: 1460 },
  ];

  it("selects the topic currently crossing the reading line", () => {
    expect(selectWeeklySection(sections, 220)).toBe("weekly-topic-1");
  });

  it("keeps the first topic before the report reaches the reading line", () => {
    expect(selectWeeklySection(sections, -900)).toBe("weekly-topic-0");
  });

  it("keeps the last topic after the final card passes the reading line", () => {
    expect(selectWeeklySection(sections, 1800)).toBe("weekly-topic-2");
  });
});
