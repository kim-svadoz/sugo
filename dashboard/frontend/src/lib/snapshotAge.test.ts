import { describe, expect, it } from "vitest";
import { snapshotAge } from "./snapshotAge.js";

describe("snapshotAge", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  it("shows a readable age", () => {
    expect(snapshotAge("2026-10-20T09:00:00.000Z", now)).toEqual({ label: "3시간 전", stale: false });
  });
  it("marks snapshots older than 24 hours", () => {
    expect(snapshotAge("2026-10-19T11:59:00.000Z", now)).toEqual({ label: "1일 전", stale: true });
  });
  it("handles missing snapshots", () => {
    expect(snapshotAge(null, now)).toEqual({ label: "동기화 기록 없음", stale: true });
  });
});
