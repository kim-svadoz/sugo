import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { RoadmapWorkResult } from "../work/types.js";

const execFileAsync = promisify(execFile);
const MAX_CONTENT_BYTES = 200_000;
const MAX_DIFF_BYTES = 400_000;
type SnapshotFile = NonNullable<RoadmapWorkResult["files"]>[number];

const SENSITIVE_PATH = /(^|\/)(\.env(?:\.|$)|\.git\/|\.aws\/|\.ssh\/|credentials?(?:\.|$)|secrets?(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx))|(^|\/)node_modules\//i;

export function sanitizeReviewArtifacts(files: SnapshotFile[]): SnapshotFile[] {
  return files.map((file) => {
    const { path, change, content, diff, unavailableReason } = file;
    if (SENSITIVE_PATH.test(path)) return { path, change, unavailableReason: "민감 파일은 Dashboard로 전송하지 않습니다." };
    return { path, change, ...(content ? { content } : {}), ...(diff ? { diff } : {}), ...(unavailableReason ? { unavailableReason } : {}) };
  });
}

function safeProjectFile(projectPath: string, path: string): { absolute: string; relative: string } | null {
  const root = resolve(projectPath);
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return { absolute, relative: rel.split(sep).join("/") };
}

async function gitOutput(projectPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: projectPath, maxBuffer: MAX_DIFF_BYTES });
    return stdout.slice(0, MAX_DIFF_BYTES);
  } catch {
    return "";
  }
}

/** 완료 시점의 변경파일을 self-contained WorkResult로 만든다. 대시보드가 원본 repo 없이도 열 수 있다. */
export async function snapshotWorkResultFiles(projectPath: string, paths: string[], startedAt?: string): Promise<SnapshotFile[]> {
  return Promise.all(paths.map(async (path): Promise<SnapshotFile> => {
    const safe = safeProjectFile(projectPath, path);
    if (!safe) return { path, change: "modified" };

    const status = await gitOutput(projectPath, ["status", "--porcelain", "--", safe.relative]);
    const code = status.slice(0, 2);
    const change: SnapshotFile["change"] = code.includes("D") ? "deleted" : code.includes("?") || code.includes("A") ? "added" : "modified";
    let diff = await gitOutput(projectPath, ["diff", "--no-ext-diff", "--unified=40", "HEAD", "--", safe.relative]);
    if (!diff && startedAt) {
      const commits = await gitOutput(projectPath, ["rev-list", "--reverse", `--since=${startedAt}`, "HEAD", "--", safe.relative]);
      const first = commits.trim().split("\n").filter(Boolean)[0];
      if (first) diff = await gitOutput(projectPath, ["diff", "--no-ext-diff", "--unified=40", `${first}^`, "HEAD", "--", safe.relative]);
    }
    let content: string | undefined;
    if (change !== "deleted") {
      try {
        const raw = await readFile(safe.absolute);
        if (raw.byteLength <= MAX_CONTENT_BYTES && !raw.includes(0)) content = raw.toString("utf8");
      } catch {
        // 파일이 사라졌거나 바이너리면 경로/상태만 보존한다.
      }
    }
    return { path: safe.relative, change, ...(content ? { content } : {}), ...(diff ? { diff } : {}) };
  }));
}

/** review 전 코드 열람용 아티팩트. 민감 경로는 목록만 남기고 본문은 절대 전송하지 않는다. */
export async function snapshotReviewArtifacts(projectPath: string, paths: string[], startedAt?: string): Promise<SnapshotFile[]> {
  const files = await snapshotWorkResultFiles(projectPath, paths, startedAt);
  return sanitizeReviewArtifacts(files);
}
