import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertProjectDirectory } from "../src/projectRegistration.js";

describe("assertProjectDirectory", () => {
  it("accepts a folder with a project marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-project-"));
    await writeFile(join(root, "package.json"), "{}");
    await expect(assertProjectDirectory(root)).resolves.toBeUndefined();
  });

  it("rejects an arbitrary directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-folder-"));
    await mkdir(join(root, "notes"));
    await expect(assertProjectDirectory(root)).rejects.toMatchObject({ code: "PROJECT_MARKER_NOT_FOUND" });
  });
});
