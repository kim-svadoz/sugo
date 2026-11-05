import { describe, expect, it } from "vitest";
import { remoteRepositoryBrowserUrl, repositoryConnectionBadges } from "./repositoryConnectionPresentation.js";

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
      { label: "AWS 서비스 상태 연동", tone: "confirmed" },
    ]);
  });
});

describe("remoteRepositoryBrowserUrl", () => {
  it("turns GitHub HTTPS and SSH remotes into repository browser URLs", () => {
    expect(remoteRepositoryBrowserUrl({
      provider: "github",
      remoteUrl: "https://github.com/acme/sugo.git",
      repository: "acme/sugo",
    })).toBe("https://github.com/acme/sugo");
    expect(remoteRepositoryBrowserUrl({
      provider: "github",
      remoteUrl: "git@github.com:acme/sugo.git",
      repository: "acme/sugo",
    })).toBe("https://github.com/acme/sugo");
  });

  it("opens an AWS CodeCommit repository in the region from its remote", () => {
    expect(remoteRepositoryBrowserUrl({
      provider: "aws_codecommit",
      remoteUrl: "https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/sample-service",
      repository: "sample-service",
    })).toBe("https://console.aws.amazon.com/codesuite/codecommit/home?region=ap-northeast-2#/repository/sample-service/browse/HEAD/--/");
    expect(remoteRepositoryBrowserUrl({
      provider: "aws_codecommit",
      remoteUrl: "codecommit::ap-northeast-2://sample-service",
      repository: "sample-service",
    })).toBe("https://console.aws.amazon.com/codesuite/codecommit/home?region=ap-northeast-2#/repository/sample-service/browse/HEAD/--/");
  });

  it("does not make an unrecognized remote clickable", () => {
    expect(remoteRepositoryBrowserUrl({
      provider: "git_remote",
      remoteUrl: "ssh://git@example.internal/team/repository.git",
      repository: "team/repository",
    })).toBeNull();
  });
});
