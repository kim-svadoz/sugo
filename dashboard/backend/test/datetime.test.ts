import { describe, expect, it } from "vitest";
import { toDbDateTime } from "../src/db/datetime.js";

// MySQL TIMESTAMP는 플러그인이 보내는 ISO 8601을 거부한다 — SQLite로는 안 드러나는 계약이라 여기 고정한다.
describe("toDbDateTime", () => {
  it("반드시 지켜야: ISO 8601(T/Z/밀리초)을 MySQL 공용 형태로 변환한다", () => {
    expect(toDbDateTime("2026-01-02T00:00:00.000Z")).toBe("2026-01-02 00:00:00.000");
  });
  it("타임존 오프셋을 UTC로 정규화한다", () => {
    expect(toDbDateTime("2026-01-02T09:00:00+09:00")).toBe("2026-01-02 00:00:00.000");
  });
  it("null/undefined는 null", () => {
    expect(toDbDateTime(null)).toBeNull();
    expect(toDbDateTime(undefined)).toBeNull();
  });
  it("반드시 지켜야: 파싱 불가값은 null(datetime 컬럼에 garbage 넣어 MySQL 크래시 방지)", () => {
    expect(toDbDateTime("not-a-date")).toBeNull();
    expect(toDbDateTime("완전-쓰레기-값")).toBeNull();
  });
});
