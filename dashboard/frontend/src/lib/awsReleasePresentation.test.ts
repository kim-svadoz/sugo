import { describe, expect, it } from "vitest";
import { compareRelease } from "./awsReleasePresentation.js";

const release = { latestBuildNumber: 421, latestBuildCommit: "abc123", baseBranch: "development" };

describe("AWS release comparison", () => {
  it("distinguishes uncommitted, unbuilt, built and fully deployed states", () => {
    expect(compareRelease(release, { branch: "development", headCommit: "abc123", baseCommit: "abc123", dirty: true }, ["421"])).toBe("UNCOMMITTED");
    expect(compareRelease(release, { branch: "development", headCommit: "new456", baseCommit: "new456", dirty: false }, ["421"])).toBe("COMMIT_NOT_BUILT");
    expect(compareRelease(release, { branch: "development", headCommit: "abc123", baseCommit: "abc123", dirty: false }, ["420", "421"])).toBe("BUILT_NOT_DEPLOYED");
    expect(compareRelease(release, { branch: "development", headCommit: "abc123", baseCommit: "abc123", dirty: false }, ["421", "421"])).toBe("DEPLOYED");
  });

  it("compares the pipeline base branch instead of an unrelated checked-out feature branch", () => {
    expect(compareRelease(release, {
      branch: "feature/infinite-scroll",
      headCommit: "feature456",
      baseCommit: "abc123",
      dirty: false,
    }, ["421", "421", "421"])).toBe("DEPLOYED");
  });

  it("does not claim a match when evidence is incomplete", () => {
    expect(compareRelease(null, { branch: "main", headCommit: "abc123", baseCommit: null, dirty: false }, ["421"])).toBe("UNKNOWN");
    expect(compareRelease(release, { branch: "main", headCommit: null, baseCommit: null, dirty: false }, ["421"])).toBe("UNKNOWN");
  });
});
