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
  expect(summarizeDeployment([], 0)).toMatchObject({ environment: "UNKNOWN", total: 0 });
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
    expect((await projectSpecDeployments(db, "u", "ws", nodes)).get("spec")?.sources?.[1]).toMatchObject({ state: "committed", commit: finalCommit });
    git("add", "a.txt"); git("commit", "-m", "later feature edit");
    expect((await projectSpecDeployments(db, "u", "ws", nodes)).get("spec")?.sources?.[1]).toMatchObject({ state: "committed", commit: finalCommit });
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
  expect((await getScheduledSpecs(db, "u"))[0]).toMatchObject({ status: "verification", unverified_task_count: 1, deployment: { environment: "DEV" } });
  expect((await projectSpecDeployments(db, "other-user", "ws", roadmap)).size).toBe(0);
  await db.exec("UPDATE user_aws_context_snapshots SET observed_at = ?", ["2020-01-01T00:00:00Z"]);
  expect((await getRoadmap(db, "u", "ws")).find(n => n.id === "spec")?.deployment).toMatchObject({ environment: "DEV", stale: true });
  await db.exec("UPDATE user_aws_context_snapshots SET observed_at = ?", [new Date().toISOString()]);
  await db.exec("UPDATE sugo_roadmap_nodes SET work_result = NULL WHERE id = 'task'");
  expect((await getRoadmap(db, "u", "ws")).find(n => n.id === "spec")?.deployment?.environment).toBe("UNKNOWN");
 } finally { await db.close(); }
});


it("uses a separately connected build account for PRD and refuses an unrelated image registry", async () => {
 const dir = mkdtempSync(join(tmpdir(), "sugo-cross-account-"));
 const name = dir.split(/[\\/]/).at(-1)!;
 const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
 try {
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(dir, "buildspec.yml"), `env:\n  variables:\n    ECR_URI: 123.dkr.ecr.test.amazonaws.com\n    REPOSITORY_NAME: ${name}\nphases:\n  build:\n    commands:\n      - IMAGE_TAG=$CODEBUILD_BUILD_NUMBER\n      - docker push \${ECR_URI}/\${REPOSITORY_NAME}:\${IMAGE_TAG}\n`);
  git("add", "."); git("commit", "-m", "build"); const commit = git("rev-parse", "HEAD");
  const production = { accountName: "prd", region: "test", observedAt: new Date().toISOString(), inventory: [] };
  const build = { accountName: "default", region: "test", observedAt: new Date().toISOString(), inventory: [{ service: "codepipeline", resources: [{ kind: "pipeline", id: "p", metadata: { repositoryName: name, buildHistory: [{ number: 421, commit }] } }] }] };
  const metadata = { runningCount: 1, runtimeImages: [{ image: `123.dkr.ecr.test.amazonaws.com/${name}:421`, imageDigest: "sha256:abc", tags: ["421"] }] };
  expect(await resolveDeployedCommits(dir, metadata, production, [build])).toEqual([commit]);
  expect(await resolveDeployedCommits(dir, { ...metadata, runtimeImages: [{ ...metadata.runtimeImages[0], image: `999.dkr.ecr.test.amazonaws.com/${name}:421` }] }, production, [build])).toBeNull();
  expect(await resolveDeployedCommits(dir, metadata, production, [{ ...build, observedAt: "2020-01-01" }])).toEqual([commit]);
  expect(await resolveDeployedCommits(dir, metadata, production, [{ ...build, observedAt: "2099-01-01" }])).toBeNull();
  const db = createSqliteClient();
  try {
   await db.execScript(readFileSync(new URL("./schema.sqlite.sql", import.meta.url), "utf8"));
   await syncWorkspace(db, { userId: "u", name: "ws", projects: [dir] });
   const service = { kind: "service", id: "api", metadata: { ...metadata, cluster: "cluster", status: "ACTIVE", rolloutState: "COMPLETED", desiredCount: 1, images: [metadata.runtimeImages[0].image] } };
   const other = { kind: "service", id: "another-api", metadata: { ...service.metadata, images: ["123.dkr.ecr.test.amazonaws.com/another-repo:421"] } };
   for (const account of ["default", "prd"]) await db.exec("INSERT INTO user_aws_context_accounts VALUES (?, ?, ?, ?, ?, ?, ?)", ["u", account, "test", "test", "123", "test", new Date().toISOString()]);
   await db.exec("INSERT INTO user_aws_context_snapshots VALUES (?, ?, ?, ?)", ["u", "default", JSON.stringify(build.inventory), new Date().toISOString()]);
   await db.exec("INSERT INTO user_aws_context_snapshots VALUES (?, ?, ?, ?)", ["u", "prd", JSON.stringify([{ service: "ecs", resources: [service, other] }]), new Date().toISOString()]);
   await db.exec("INSERT INTO user_project_integration_mappings VALUES (?, ?, ?, ?)", ["u", dir, JSON.stringify(["api", "another-api"].map(service => ({ accountName: "prd", service, environment: "prd", cluster: "cluster" }))), new Date().toISOString()]);
   const view = (await projectSpecDeployments(db, "u", "ws", [{ id: "spec", level: "spec", parent: null, status: "done", project_path: dir }, { id: "task", level: "task", parent: "spec", status: "done", work_result: { sourceRevision: { projectPath: dir, state: "committed", commit } } }])).get("spec")!;
   expect(view).toMatchObject({ environment: "PRD", partial: false, total: 1 });
   expect(view.environments[0].services.map(s => s.service)).toEqual(["api"]);
  } finally { await db.close(); }

 } finally { rmSync(dir, { recursive: true, force: true }); }
});

import { recoverLegacySource } from "../src/services/legacyDeploymentSource.js";
it("recovers historical file snapshots rather than today's HEAD, and never invents a source", async () => {
 const dir = mkdtempSync(join(tmpdir(), "sugo-legacy-source-"));
 const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
 try {
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(dir, "a.txt"), "task snapshot\n"); git("add", "."); git("commit", "-m", "task"); const commit = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "a.txt"), "later edits\n"); git("add", "."); git("commit", "-m", "later");
  const result = { startedAt: "2020-01-01", endedAt: new Date().toISOString(), path: join(dir, "sugo/features/task/work-result.md"), files: [{ path: "a.txt", change: "modified", content: "task snapshot\r\n" }] };
  const source = await recoverLegacySource(result, new Set([dir]));
  expect(source).toMatchObject({ state: "committed", commit, recoveredFrom: "legacy_file_snapshot" });
  expect(await recoverLegacySource({ ...result, files: [{ path: "a.txt", content: "no matching snapshot" }] }, new Set([dir]))).toMatchObject({ state: "unknown" });
  expect(await recoverLegacySource({ ...result, files: [{ path: "../other", content: "task snapshot" }] }, new Set([dir]))).toBeNull();
  expect(await recoverLegacySource(result, new Set([join(dir, "other")]))).toBeNull();
  expect(await recoverLegacySource({ ...result, files: [{ path: "a.txt" }] }, new Set([dir]))).toBeNull();
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("recovers a task on another branch and a unique explicit recorded commit without file contents", async () => {
 const dir = mkdtempSync(join(tmpdir(), "sugo-legacy-branch-"));
 const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
 try {
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(dir, "base.txt"), "base"); git("add", "."); git("commit", "-m", "base"); const base = git("rev-parse", "HEAD");
  git("checkout", "-b", "feature/ranking"); writeFileSync(join(dir, "module.txt"), "new module\n"); git("add", "."); git("commit", "-m", "module"); const commit = git("rev-parse", "HEAD"); git("checkout", "main");
  const result = { startedAt: "2020-01-01", endedAt: new Date().toISOString(), path: join(dir, "sugo/features/task/work-result.md") };
  expect(await recoverLegacySource({ ...result, files: [{ path: "module.txt", content: "new module\n" }] }, new Set([dir]))).toMatchObject({ state: "committed", commit });
  expect(await recoverLegacySource({ ...result, summary: `직접 커밋함(커밋 ${commit.slice(0, 7)})` }, new Set([dir]))).toMatchObject({ state: "committed", commit, recoveredFrom: "legacy_recorded_commit" });
  expect(await recoverLegacySource({ ...result, summary: "커밋 deadbee" }, new Set([dir]))).toBeNull();
  expect(await recoverLegacySource({ ...result, summary: `commit ${base}, 커밋 ${commit}` }, new Set([dir]))).toBeNull();
  expect(await recoverLegacySource({ ...result, startedAt: "2099-01-01", summary: `커밋 ${commit}` }, new Set([dir]))).toBeNull();
  expect(await recoverLegacySource({ ...result, summary: `커밋 ${commit}`, files: [{ path: "module.txt", content: "wrong snapshot" }] }, new Set([dir]))).toMatchObject({ state: "unknown" });
  expect(await recoverLegacySource({ ...result, summary: `커밋 ${commit}` }, new Set([join(dir, "other")]))).toBeNull();
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
