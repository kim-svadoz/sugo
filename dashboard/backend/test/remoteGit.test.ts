import { describe, expect, it } from "vitest";
import { describeRemoteGit } from "../src/git/remoteGit.js";

describe("describeRemoteGit", () => {
  it.each([
    ["git@github.com:team/service.git", "github", "GitHub", "team/service"],
    ["https://gitlab.com/team/service.git", "gitlab", "GitLab", "team/service"],
    ["ssh://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/service", "aws_codecommit", "AWS CodeCommit", "service"],
    ["codecommit::ap-northeast-2://service", "aws_codecommit", "AWS CodeCommit", "service"],
    ["https://bitbucket.example.com/scm/team/service.git", "bitbucket_server", "Bitbucket Server", "team/service"],
  ] as const)("describes %s", (remoteUrl, provider, providerLabel, repository) => {
    expect(describeRemoteGit(remoteUrl)).toEqual({ remoteUrl, provider, providerLabel, repository });
  });

  it("keeps an unknown Git server distinct from a named provider", () => {
    expect(describeRemoteGit("ssh://git.example.com/team/service.git")).toEqual({
      remoteUrl: "ssh://git.example.com/team/service.git",
      provider: "git_remote",
      providerLabel: "Git 원격 저장소",
      repository: "team/service",
    });
  });
});
