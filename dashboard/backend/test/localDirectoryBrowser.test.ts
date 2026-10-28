import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectLocalDirectory } from "../src/services/localDirectoryBrowser.js";

describe("inspectLocalDirectory", () => {
  it("marks project folders and hides implementation directories", async () => {
    const home = await mkdtemp(join(tmpdir(), "sugo-browser-"));
    const project = join(home, "orders-api");
    await mkdir(project);
    await writeFile(join(project, "package.json"), "{}");
    await mkdir(join(home, ".git"));
    await mkdir(join(home, "node_modules"));

    const result = await inspectLocalDirectory(home, home);

    expect(result.parentPath).toBeNull();
    expect(result.directories).toEqual([expect.objectContaining({ name: "orders-api", projectLike: true, signals: ["package.json"] })]);
  });

  it("does not browse outside the allowed home", async () => {
    const home = await mkdtemp(join(tmpdir(), "sugo-browser-home-"));
    const outside = await mkdtemp(join(tmpdir(), "sugo-browser-outside-"));
    await expect(inspectLocalDirectory(outside, home)).rejects.toMatchObject({ code: "DIRECTORY_OUTSIDE_HOME" });
  });
});
