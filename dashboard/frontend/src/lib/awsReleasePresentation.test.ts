import { describe, expect, it } from "vitest";
import { compareRelease } from "./awsReleasePresentation.js";

const release = { latestBuildNumber: 421, latestBuildCommit: "abc123" };

describe("AWS release comparison", () => {
  it("distinguishes uncommitted, unbuilt, built and fully deployed states", () => {
    expect(compareRelease(release, { headCommit: "abc123", dirty: true }, ["421"])).toBe("UNCOMMITTED");
    expect(compareRelease(release, { headCommit: "new456", dirty: false }, ["421"])).toBe("COMMIT_NOT_BUILT");
    expect(compareRelease(release, { headCommit: "abc123", dirty: false }, ["420", "421"])).toBe("BUILT_NOT_DEPLOYED");
    expect(compareRelease(release, { headCommit: "abc123", dirty: false }, ["421", "421"])).toBe("DEPLOYED");
  });

  it("does not claim a match when evidence is incomplete", () => {
    expect(compareRelease(null, { headCommit: "abc123", dirty: false }, ["421"])).toBe("UNKNOWN");
    expect(compareRelease(release, { headCommit: null, dirty: false }, ["421"])).toBe("UNKNOWN");
  });
});
