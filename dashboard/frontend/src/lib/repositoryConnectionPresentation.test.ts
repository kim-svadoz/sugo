import { describe, expect, it } from "vitest";
import { repositoryConnectionBadges } from "./repositoryConnectionPresentation.js";

describe("repositoryConnectionBadges", () => {
  it("separates local Git, remote provider, and operational suggestions", () => {
    expect(repositoryConnectionBadges({
      localGitAvailable: true,
      remoteProviderLabel: "AWS CodeCommit",
      awsLinkMode: "suggested",
    })).toEqual([
      { label: "로컬 Git", tone: "local" },
      { label: "원격 · AWS CodeCommit", tone: "remote" },
      { label: "운영 연결 후보", tone: "suggested" },
    ]);
  });

  it("does not imply a remote service when only local Git is available", () => {
    expect(repositoryConnectionBadges({
      localGitAvailable: true,
      remoteProviderLabel: null,
      awsLinkMode: null,
    })).toEqual([{ label: "로컬 Git", tone: "local" }]);
  });

  it("labels confirmed AWS operations separately from the Git provider", () => {
    expect(repositoryConnectionBadges({
      localGitAvailable: true,
      remoteProviderLabel: "GitHub",
      awsLinkMode: "confirmed",
    })).toEqual([
      { label: "로컬 Git", tone: "local" },
      { label: "원격 · GitHub", tone: "remote" },
      { label: "AWS 운영 연결됨", tone: "confirmed" },
    ]);
  });
});
