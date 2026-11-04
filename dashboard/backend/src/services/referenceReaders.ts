import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const readerSchema = z.object({
  id: z.string().trim().min(1).max(100),
  urlPrefix: z.string().trim().url().max(2048).refine((value) => value.startsWith("https://") || value.startsWith("http://")),
  mcpServer: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/),
}).strict();

export const referenceReadersSchema = z.object({ readers: z.array(readerSchema).max(30) }).strict();
export type ReferenceReader = z.infer<typeof readerSchema>;

async function readSettings(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function loadReferenceReaders(path: string): Promise<ReferenceReader[]> {
  const parsed = z.array(readerSchema).safeParse((await readSettings(path)).referenceReaders);
  return parsed.success ? parsed.data : [];
}

export async function saveReferenceReaders(path: string, readers: ReferenceReader[]): Promise<void> {
  const value = z.array(readerSchema).max(30).parse(readers);
  const settings = await readSettings(path);
  settings.referenceReaders = value;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
