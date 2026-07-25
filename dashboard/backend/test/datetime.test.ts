import { describe, expect, it } from "vitest";
import { toDbDateTime } from "../src/db/datetime.js";

// 실제 MySQL e2e(2026-07-25)에서 발견: 플러그인 ISO 8601을 MySQL TIMESTAMP가 거부.
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
