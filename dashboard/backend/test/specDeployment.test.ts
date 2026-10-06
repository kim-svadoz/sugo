import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { summarizeDeployment } from "../src/services/specDeploymentService.js";
it("deployment tags are independent and reflect full, partial, and unknown evidence", () => {
  const row = (environment: string, included: number, total = 2, unknown = false) => ({ environment, included, total, unknown, services: [] });
  expect(summarizeDeployment([row("dev", 2), row("stg", 0)], 2).environment).toBe("DEV");
  expect(summarizeDeployment([row("dev", 2), row("stg", 1)], 2)).toMatchObject({ environment: "STG", partial: true });
  expect(summarizeDeployment([row("prd", 2)], 2)).toMatchObject({ environment: "PRD", partial: false });
  expect(summarizeDeployment([row("dev", 0)], 2).environment).toBe("LOCAL");
  expect(summarizeDeployment([row("dev", 0, 2, true)], 2).environment).toBe("UNKNOWN");
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { syncWorkspace, syncRoadmap } from "../src/services/syncService.js";
import { getRoadmap, getScheduledSpecs } from "../src/services/workspaceService.js";
import { commitIncluded, projectSpecDeployments, resolveDeployedCommits } from "../src/services/specDeploymentService.js";
it("checks actual Git ancestry, unrelated revisions, squash equivalent files and an explicit revert", async () => {
 const dir = mkdtempSync(join(tmpdir(), "sugo-deployment-git-"));
 const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
 try {
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(dir, "buildspec.yml"), "version: 0.2\nphases:\n  build:\n    commands:\n      - IMAGE_TAG=$CODEBUILD_BUILD_NUMBER\n      - docker push ${ECR_URI}/${REPOSITORY_NAME}:${IMAGE_TAG}\n");
  writeFileSync(join(dir, "a.txt"), "base"); git("add", "."); git("commit", "-m", "base"); const base = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "a.txt"), "feature"); git("add", "."); git("commit", "-m", "feature"); const commit = git("rev-parse", "HEAD");
  const source = { projectPath: dir, commit, files: [{ path: "a.txt", hash: "a".repeat(64) }] };
  writeFileSync(join(dir, "b.txt"), "later"); git("add", "."); git("commit", "-m", "later");
  expect(await commitIncluded(dir, source, git("rev-parse", "HEAD"))).toBe(true);
  expect(await commitIncluded(dir, source, base)).toBe(false);
  git("revert", "--no-edit", commit);
  expect(await commitIncluded(dir, source, git("rev-parse", "HEAD"))).toBe(false);
  git("checkout", "-b", "squashed", base);
  writeFileSync(join(dir, "a.txt"), "feature"); writeFileSync(join(dir, "c.txt"), "squash"); git("add", "."); git("commit", "-m", "squash");
  expect(await commitIncluded(dir, source, git("rev-parse", "HEAD"))).toBe(true);
  expect(await commitIncluded(dir, source, "f".repeat(40))).toBeNull();
  const image = `123.dkr.ecr.ap-northeast-2.amazonaws.com/${dir.split(/[\\/]/).at(-1)}:421`;
  const metadata = { runningCount: 1, runtimeImages: [{ image, imageDigest: "sha256:abc", tags: ["421"] }] };
  const snapshot = { accountName: "dev", region: "test", observedAt: new Date().toISOString(), inventory: [{ service: "codepipeline", resources: [{ kind: "pipeline", id: "p", metadata: { repositoryName: dir.split(/[\\/]/).at(-1), buildHistory: [{ number: 999, commit: base }, { number: 421, commit }] } }] }] };
  expect(await resolveDeployedCommits(dir, metadata, snapshot)).toEqual([commit]); // running 421, not latest successful 999
  expect(await resolveDeployedCommits(dir, { ...metadata, runtimeImages: [{ image, tags: ["421"] }] }, snapshot)).toBeNull();
  expect(await resolveDeployedCommits(dir, { ...metadata, runtimeError: "AccessDenied" }, snapshot)).toBeNull();
  const db = createSqliteClient();
  try {
    await db.execScript(readFileSync(new URL("./schema.sqlite.sql", import.meta.url), "utf8"));
    await syncWorkspace(db, { userId: "u", name: "ws", projects: [dir] });
    const finalCommit = git("rev-parse", "HEAD");
    const nodes = [
      { id: "spec", level: "spec", parent: null, status: "done" },
      { id: "old", level: "task", parent: "spec", status: "done", work_result: { sourceRevision: { projectPath: dir, state: "committed", commit: base } } },
      { id: "new", level: "task", parent: "spec", status: "done", work_result: { sourceRevision: { projectPath: dir, state: "pending", recordedAt: "2020-01-01", files: [{ path: "a.txt", hash: createHash("sha256").update("feature").digest("hex") }] } } },
    ];
    for (const [env, deployed] of [["dev", finalCommit], ["stg", base]]) {
      const data = [{ service: "ecs", resources: [{ kind: "service", id: "api", metadata: { cluster: "cluster", status: "ACTIVE", rolloutState: "COMPLETED", runningCount: 1, desiredCount: 1, images: [image], runtimeImages: [{ image, imageDigest: "sha256:abc", tags: [deployed] }] } }] }];
      await db.exec("INSERT INTO user_aws_context_accounts VALUES (?, ?, ?, ?, ?, ?, ?)", ["u", env, "test", "test", "123", "test", new Date().toISOString()]);
      await db.exec("INSERT INTO user_aws_context_snapshots VALUES (?, ?, ?, ?)", ["u", env, JSON.stringify(data), new Date().toISOString()]);
    }
    await db.exec("INSERT INTO user_project_integration_mappings VALUES (?, ?, ?, ?)", ["u", dir, JSON.stringify(["dev", "stg"].map(env => ({ accountName: env, service: "api", cluster: "cluster", environment: env }))), new Date().toISOString()]);
    const view = (await projectSpecDeployments(db, "u", "ws", nodes)).get("spec")!;
    expect(view).toMatchObject({ environment: "STG", partial: true, total: 2 });
    expect(view.environments.map(e => [e.environment, e.included])).toEqual([["dev", 2], ["stg", 1]]);
    expect(view.sources?.[1]).toMatchObject({ state: "committed", commit: finalCommit });
    writeFileSync(join(dir, "a.txt"), "edited after completion");
    expect((await projectSpecDeployments(db, "u", "ws", nodes)).get("spec")?.sources?.[1]).toMatchObject({ state: "pending", commit: null });
  } finally { await db.close(); }


 } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30000);
it("projects real deployed revisions onto SPEC without changing local completion, supports stale/legacy/owner isolation", async () => {
 const db = createSqliteClient();
 try {
  await db.execScript(readFileSync(new URL("./schema.sqlite.sql", import.meta.url), "utf8"));
  const project = join(tmpdir(), "deployment-test-project"); const commit = "a".repeat(40);
  await syncWorkspace(db, { userId: "u", name: "ws", projects: [project] });
  const workResult = { sourceRevision: { projectPath: project, state: "committed", commit }, report: { completionGrade: "unverified", bypassLabels: [{ kind: "runtimeUnverified", reason: "review" }] } };
  await syncRoadmap(db, "u", "ws", [
   { id: "spec", title: "spec", level: "spec", status: "done" },
   { id: "run", title: "run", level: "workstream", parent: "spec", status: "done" },
   { id: "task", title: "task", level: "task", parent: "run", status: "done", workResult },
  ]);
  const image = "123.dkr.ecr.ap-northeast-2.amazonaws.com/deployment-test-project:1";
  const inventory = [{ service: "ecs", resources: [{ kind: "service", id: "api", metadata: { cluster: "cluster", status: "ACTIVE", rolloutState: "COMPLETED", desiredCount: 1, runningCount: 1, images: [image], runtimeImages: [{ image, imageDigest: "sha256:123", tags: [commit] }] } }] }];
  await db.exec("INSERT INTO user_aws_context_accounts VALUES (?, ?, ?, ?, ?, ?, ?)", ["u", "dev", "profile", "ap-northeast-2", "123", "test", new Date().toISOString()]);
  await db.exec("INSERT INTO user_aws_context_snapshots VALUES (?, ?, ?, ?)", ["u", "dev", JSON.stringify(inventory), new Date().toISOString()]);
  await db.exec("INSERT INTO user_project_integration_mappings VALUES (?, ?, ?, ?)", ["u", project, JSON.stringify([{ accountName: "dev", service: "api", cluster: "cluster", environment: "dev" }]), new Date().toISOString()]);
  const roadmap = await getRoadmap(db, "u", "ws");
  expect(roadmap.find(n => n.id === "spec")).toMatchObject({ display_status: "verification", deployment: { environment: "DEV", partial: false } });
  expect((await getScheduledSpecs(db, "u"))[0]).toMatchObject({ status: "verification", deployment: { environment: "DEV" } });
  expect((await projectSpecDeployments(db, "other-user", "ws", roadmap)).size).toBe(0);
  await db.exec("UPDATE user_aws_context_snapshots SET observed_at = ?", ["2020-01-01T00:00:00Z"]);
  expect((await getRoadmap(db, "u", "ws")).find(n => n.id === "spec")?.deployment?.environment).toBe("UNKNOWN");
  await db.exec("UPDATE user_aws_context_snapshots SET observed_at = ?", [new Date().toISOString()]);
  await db.exec("UPDATE sugo_roadmap_nodes SET work_result = NULL WHERE id = 'task'");
  expect((await getRoadmap(db, "u", "ws")).find(n => n.id === "spec")?.deployment?.environment).toBe("UNKNOWN");
 } finally { await db.close(); }
});
