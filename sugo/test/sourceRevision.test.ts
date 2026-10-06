import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { collectSourceRevision } from "../src/sourceRevision.js";
it("records a final committed revision, but never calls dirty work the previous HEAD", async () => {
 const dir = mkdtempSync(join(tmpdir(), "sugo-revision-"));
 const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
 try {
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(dir, "작업.txt"), "first"); git("add", "."); git("commit", "-m", "first");
  const committed = await collectSourceRevision(dir, ["작업.txt"], "2020-01-01T00:00:00Z");
  expect(committed).toMatchObject({ state: "committed", commit: git("rev-parse", "HEAD"), files: [{ path: "작업.txt" }] });
  writeFileSync(join(dir, "작업.txt"), "new work");
  const pending = await collectSourceRevision(dir, ["작업.txt"], "2020-01-01T00:00:00Z");
  expect(pending?.state).toBe("pending"); expect(pending?.commit).toBeUndefined();
  expect(pending?.files[0].hash).not.toBe(committed?.files[0].hash);
  expect(await collectSourceRevision(dir, ["../outside.txt"], "2020-01-01")).toBeUndefined();
  git("add", "."); git("commit", "-m", "second");
  expect((await collectSourceRevision(dir, ["작업.txt"], "2099-01-01"))?.state).toBe("pending");
 } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30000);
