import { describe, expect, it } from "vitest";
import { AWS_REGIONS, awsRegionLabel } from "./awsRegions.js";

describe("AWS region presentation", () => {
  it("shows a readable location and preserves unknown region codes", () => {
    expect(awsRegionLabel("ap-northeast-2")).toBe("아시아 태평양(서울) · ap-northeast-2");
    expect(awsRegionLabel("custom-region-1")).toBe("custom-region-1");
  });

  it("keeps the region codes unique", () => {
    expect(new Set(AWS_REGIONS.map(([, code]) => code)).size).toBe(AWS_REGIONS.length);
  });
});
