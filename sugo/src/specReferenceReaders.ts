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

export async function loadReferenceReaders(path = join(sugoHomeDir(), ".claude", "sugo", "settings.json")): Promise<ReferenceReader[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { referenceReaders?: unknown };
    const result = z.array(readerSchema).safeParse(parsed.referenceReaders);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function matchReferenceReader(url: string, readers: ReferenceReader[]): ReferenceReader | undefined {
  return readers
    .filter((reader) => url.startsWith(reader.urlPrefix))
    .sort((left, right) => right.urlPrefix.length - left.urlPrefix.length)[0];
}
