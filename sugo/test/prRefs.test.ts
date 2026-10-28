import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectPrRefs, parseRemoteUrl } from "../src/prRefs.js";

const execFileAsync = promisify(execFile);

describe("parseRemoteUrl — 순수 함수", () => {
  it("https URL을 파싱한다", () => {
    expect(parseRemoteUrl("https://bitbucket.example.com/scm/proj/repo.git")).toEqual({
      baseUrl: "https://bitbucket.example.com",
      projectKey: "PROJ",
      repoSlug: "repo",
    });
  });

  it("ssh 축약형(git@host:org/repo.git)을 파싱한다", () => {
    expect(parseRemoteUrl("git@github.com:my-org/my-repo.git")).toEqual({
      baseUrl: "https://github.com",
      projectKey: "MY-ORG",
      repoSlug: "my-repo",
    });
  });

  it("ssh:// URL(포트 포함)을 파싱한다", () => {
    const result = parseRemoteUrl("ssh://git@bitbucket.example.com:7999/proj/repo.git");
    expect(result?.projectKey).toBe("PROJ");
    expect(result?.repoSlug).toBe("repo");
  });

  it(".git 확장자가 없어도 파싱한다", () => {
    expect(parseRemoteUrl("https://github.com/org/repo")).toEqual({
      baseUrl: "https://github.com",
      projectKey: "ORG",
      repoSlug: "repo",
    });
  });

  it("구조가 안 맞으면(경로 세그먼트 부족) null", () => {
    expect(parseRemoteUrl("https://example.com/onlyone")).toBeNull();
  });

  it("URL도 ssh 축약형도 아니면 null", () => {
    expect(parseRemoteUrl("not a url at all")).toBeNull();
  });
});

describe("collectPrRefs — 실제 git 저장소(읽기전용 명령만 사용)", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = mkdtempSync(join(tmpdir(), "sugo-prrefs-repo-"));
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    // --abbrev-ref HEAD는 커밋이 하나도 없는 "unborn" 브랜치에서 "main" 대신 "HEAD"를 반환할 수
    // 있다(git 버전에 따라 다름) — 실배선 테스트가 흔들리지 않게 빈 커밋을 하나 만들어둔다.
    await execFileAsync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repoDir });
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("원격이 없으면 null", async () => {
    expect(await collectPrRefs(repoDir)).toBeNull();
  });

  it("원격+브랜치가 있으면 PrRefs를 만든다", async () => {
    await execFileAsync("git", ["remote", "add", "origin", "https://bitbucket.example.com/scm/proj/repo.git"], { cwd: repoDir });
    const result = await collectPrRefs(repoDir);
    expect(result).toEqual({
      baseUrl: "https://bitbucket.example.com",
      projectKey: "PROJ",
      repoSlug: "repo",
      sourceBranch: "main",
      targetBranch: "main",
    });
  });

  it("git 저장소가 아닌 디렉터리는 null", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "sugo-notrepo-"));
    try {
      expect(await collectPrRefs(notARepo)).toBeNull();
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});
