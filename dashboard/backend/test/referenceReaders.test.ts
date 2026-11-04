import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadReferenceReaders, saveReferenceReaders } from "../src/services/referenceReaders.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("reference reader settings", () => {
  it("preserves unrelated personal settings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sugo-reference-readers-"));
    dirs.push(dir);
    const path = join(dir, "settings.json");
    await writeFile(path, JSON.stringify({ dashboard: { enabled: true }, presentation: { mcpServers: ["docs"] } }));

    const readers = [{ id: "docs", urlPrefix: "https://docs.example.test/", mcpServer: "docs" }];
    await saveReferenceReaders(path, readers);

    expect(await loadReferenceReaders(path)).toEqual(readers);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      dashboard: { enabled: true },
      presentation: { mcpServers: ["docs"] },
    });
  });

  it("does not overwrite a malformed settings file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sugo-reference-readers-"));
    dirs.push(dir);
    const path = join(dir, "settings.json");
    await writeFile(path, "{ malformed");

    await expect(saveReferenceReaders(path, [])).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("{ malformed");
  });
});
