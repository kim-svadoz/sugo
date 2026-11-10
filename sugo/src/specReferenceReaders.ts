import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { sugoHomeDir } from "./homeDir.js";

const readerSchema = z.object({
  id: z.string().trim().min(1).max(100),
  urlPrefix: z.string().trim().url().max(2048).refine((value) => value.startsWith("https://") || value.startsWith("http://")),
  mcpServer: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/),
});

export type ReferenceReader = z.infer<typeof readerSchema>;

export function normalizeReferenceReaderPrefix(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  url.search = "";
  const confluenceSpace = url.pathname.match(/^\/wiki\/spaces\/([^/]+)(?:\/.*)?$/);
  if (confluenceSpace) url.pathname = `/wiki/spaces/${confluenceSpace[1]}/`;
  return url.toString();
}

function matchesUrlPrefix(value: URL, prefix: URL): boolean {
  if (value.protocol.toLowerCase() !== prefix.protocol.toLowerCase() || value.host.toLowerCase() !== prefix.host.toLowerCase()) return false;
  const base = prefix.pathname.endsWith("/") ? prefix.pathname : `${prefix.pathname}/`;
  return value.pathname === prefix.pathname || value.pathname.startsWith(base);
}

async function planningDocsEnabled(path: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { planningDocs?: unknown };
    return parsed.planningDocs === true;
  } catch {
    return false;
  }
}

export async function loadReferenceReaders(
  path = join(sugoHomeDir(), ".claude", "sugo", "settings.json"),
  featuresPath = join(sugoHomeDir(), ".claude", "sugo", "integration-features.json"),
): Promise<ReferenceReader[]> {
  try {
    if (!await planningDocsEnabled(featuresPath)) return [];
    const parsed = JSON.parse(await readFile(path, "utf8")) as { referenceReaders?: unknown };
    const result = z.array(readerSchema).safeParse(parsed.referenceReaders);
    return result.success ? result.data.map((reader) => ({ ...reader, urlPrefix: normalizeReferenceReaderPrefix(reader.urlPrefix) })) : [];
  } catch {
    return [];
  }
}

export function matchReferenceReader(url: string, readers: ReferenceReader[]): ReferenceReader | undefined {
  try {
    const target = new URL(url);
    target.hash = "";
    target.search = "";
    return readers
      .map((reader) => ({ ...reader, urlPrefix: normalizeReferenceReaderPrefix(reader.urlPrefix) }))
      .filter((reader) => matchesUrlPrefix(target, new URL(reader.urlPrefix)))
      .sort((left, right) => new URL(right.urlPrefix).pathname.length - new URL(left.urlPrefix).pathname.length)[0];
  } catch {
    return undefined;
  }
}
