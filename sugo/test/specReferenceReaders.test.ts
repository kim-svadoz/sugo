import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadReferenceReaders, matchReferenceReader, normalizeReferenceReaderPrefix } from "../src/specReferenceReaders.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("spec reference readers", () => {
  it("uses the most specific URL prefix", () => {
    const readers = [
      { id: "wiki", urlPrefix: "https://docs.example.test/", mcpServer: "knowledge" },
      { id: "team", urlPrefix: "https://docs.example.test/team/", mcpServer: "team-knowledge" },
    ];
    expect(matchReferenceReader("https://docs.example.test/team/plan", readers)?.mcpServer).toBe("team-knowledge");
  });

  it("normalizes a Confluence page URL to its space boundary", () => {
    expect(normalizeReferenceReaderPrefix("https://example.atlassian.net/wiki/spaces/PRODUCT/overview?homepageId=99024898#top"))
      .toBe("https://example.atlassian.net/wiki/spaces/PRODUCT/");
  });

  it("matches URL components while ignoring host case, query, and fragment", () => {
    const readers = [{ id: "wiki", urlPrefix: "https://example.atlassian.net/wiki/spaces/PRODUCT/", mcpServer: "atlassian" }];
    expect(matchReferenceReader("https://EXAMPLE.atlassian.net/wiki/spaces/PRODUCT/pages/1?draft=true#section", readers)?.mcpServer)
      .toBe("atlassian");
  });

  it("does not match a partial path segment", () => {
    const readers = [{ id: "ab", urlPrefix: "https://docs.example.test/wiki/spaces/AB/", mcpServer: "ab" }];
    expect(matchReferenceReader("https://docs.example.test/wiki/spaces/ABC/pages/1", readers)).toBeUndefined();
  });

  it("routes Confluence short links through a wiki-wide rule", () => {
    const readers = [{ id: "wiki", urlPrefix: "https://example.atlassian.net/wiki/", mcpServer: "atlassian" }];
    expect(matchReferenceReader("https://example.atlassian.net/wiki/x/4_sXAQ", readers)?.mcpServer).toBe("atlassian");
  });

  it("ignores invalid private settings without breaking spec-writer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sugo-reference-readers-"));
    dirs.push(dir);
    const path = join(dir, "settings.json");
    await writeFile(path, JSON.stringify({ referenceReaders: [{ urlPrefix: "not-a-url", mcpServer: "" }] }));
    const featuresPath = join(dir, "integration-features.json");
    await writeFile(featuresPath, JSON.stringify({ planningDocs: true }));
    await expect(loadReferenceReaders(path, featuresPath)).resolves.toEqual([]);
  });

  it("returns configured readers only while planning document integration is enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sugo-reference-readers-"));
    dirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    const featuresPath = join(dir, "integration-features.json");
    const readers = [{ id: "docs", urlPrefix: "https://docs.example.test/", mcpServer: "team-docs" }];
    await writeFile(settingsPath, JSON.stringify({ referenceReaders: readers }));
    await writeFile(featuresPath, JSON.stringify({ planningDocs: false }));
    await expect(loadReferenceReaders(settingsPath, featuresPath)).resolves.toEqual([]);
    await writeFile(featuresPath, JSON.stringify({ planningDocs: true }));
    await expect(loadReferenceReaders(settingsPath, featuresPath)).resolves.toEqual(readers);
  });
});
