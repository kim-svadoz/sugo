import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PrRefs {
  baseUrl: string;
  projectKey: string;
  repoSlug: string;
  sourceBranch: string;
  targetBranch: string;
}

/**
 * 읽기 전용 git 명령 실행. `execFile`이라 쉘 인터폴레이션이 없고, 실패(git 저장소 아님·명령
 * 실패)는 조용히 null로 접는다 — 이 파일 밖(todoSpec.ts 등)에서도 브랜치 조회에 재사용한다.
 */
export async function runGit(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * git remote URL을 baseUrl/projectKey/repoSlug로 쪼갠다. ssh 축약형(`git@host:org/repo.git`),
 * ssh:// URL, https:// URL을 모두 다룬다 — Bitbucket/GitHub/GitLab 등 호스트 종류를 가리지 않고
 * "host/조직/저장소" 구조라는 공통 관례에만 기댄다(prRefs는 Bitbucket 전제지만, 파서 자체는
 * 범용으로 둬서 다른 호스트에서도 최소한 baseUrl/projectKey/repoSlug는 뽑히게 했다).
 */
export function parseRemoteUrl(remoteUrl: string): { baseUrl: string; projectKey: string; repoSlug: string } | null {
  const trimmed = remoteUrl.trim();
  let host: string;
  let pathPart: string;

  const sshShorthand = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshShorthand) {
    host = sshShorthand[1];
    pathPart = sshShorthand[2];
  } else {
    try {
      const u = new URL(trimmed);
      host = u.host;
      pathPart = u.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }

  pathPart = pathPart.replace(/\.git$/, "");
  const segments = pathPart.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const repoSlug = segments[segments.length - 1];
  const projectKey = segments[segments.length - 2];
  return { baseUrl: `https://${host}`, projectKey: projectKey.toUpperCase(), repoSlug };
}

/**
 * collectPrRefs: 태스크 완료(커밋) 시 git 원격/브랜치 정보를 읽어 대시보드의
 * "Create PR" 버튼에 필요한 참조를 만든다. 전부 읽기 전용 git 명령(remote get-url, 현재 브랜치)
 * 이라 실행 위험이 없다. 원격이 없거나(예: 로컬 전용 저장소) git 저장소가 아니면 null(no-op).
 */
export async function collectPrRefs(projectPath: string): Promise<PrRefs | null> {
  const remoteUrl = await runGit(["remote", "get-url", "origin"], projectPath);
  if (!remoteUrl) return null;
  const parsed = parseRemoteUrl(remoteUrl);
  if (!parsed) return null;
  const sourceBranch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], projectPath)) ?? "HEAD";
  const remoteHead = await runGit(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], projectPath);
  const targetBranch = remoteHead?.replace(/^origin\//, "")
    ?? (await runGit(["config", "--get", "init.defaultBranch"], projectPath))
    ?? (sourceBranch === "HEAD" ? "main" : sourceBranch);
  return { ...parsed, sourceBranch, targetBranch };
}
