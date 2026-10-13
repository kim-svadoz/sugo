import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { snapshotReviewArtifacts } from "../src/dashboard/workResultFiles.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

describe("snapshotReviewArtifacts", () => {
  it("일반 소스는 읽고 민감 파일은 본문을 전송하지 않는다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-review-artifact-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), "export const ok = true;\n");
    await writeFile(join(root, ".env"), "TOKEN=do-not-send\n");
    const files = await snapshotReviewArtifacts(root, ["src/app.ts", ".env"]);
    expect(files[0].content).toContain("ok = true");
    expect(files[1]).toMatchObject({ path: ".env", unavailableReason: expect.any(String) });
    expect(files[1].content).toBeUndefined();
    expect(files[1].diff).toBeUndefined();
  });

  it("작업이 이미 커밋됐어도 세션 시작 이후 commit diff를 보존한다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-review-artifact-commit-"));
    await exec("git", ["init", "-q"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test"], { cwd: root });
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), "export const value = 1;\n");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-qm", "base"], { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" } });
    const startedAt = "2021-01-01T00:00:00Z";
    await writeFile(join(root, "src/app.ts"), "export const value = 2;\n");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-qm", "change"], { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: "2022-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2022-01-01T00:00:00Z" } });

    const [file] = await snapshotReviewArtifacts(root, ["src/app.ts"], startedAt);
    expect(file.change).toBe("modified");
    expect(file.diff).toContain("-export const value = 1;");
    expect(file.diff).toContain("+export const value = 2;");
  });
});
