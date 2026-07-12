import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { slugify } from "./slug.js";
import { checkpointsDir } from "./storage.js";
import type { Checkpoint } from "./types.js";

function generateCheckpointId(): string {
  return `CP-${randomBytes(4).toString("hex")}`;
}

export interface AddCheckpointParams {
  title: string;
  category?: string;
  applies_to?: string[];
  checklist: string[];
}

/** hulk/<ws>/checkpoints/CP-<id>-<slug>.md (frontmatter+본문) — §8 */
export async function addCheckpoint(workspace: string, params: AddCheckpointParams): Promise<Checkpoint> {
  const id = generateCheckpointId();
  const checkpoint: Checkpoint = {
    id,
    title: params.title,
    category: params.category,
    applies_to: params.applies_to,
    checklist: params.checklist,
    created_at: new Date().toISOString(),
  };
  const dir = checkpointsDir(workspace);
  await mkdir(dir, { recursive: true });
  const content = stringifyFrontmatter({
    id: checkpoint.id,
    title: checkpoint.title,
    category: checkpoint.category ?? null,
    applies_to: checkpoint.applies_to ?? [],
    checklist: checkpoint.checklist,
    created_at: checkpoint.created_at,
  });
  await atomicWriteFile(join(dir, `${id}-${slugify(params.title)}.md`), content);
  return checkpoint;
}

export async function listCheckpoints(workspace: string): Promise<Checkpoint[]> {
  const dir = checkpointsDir(workspace);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const checkpoints: Checkpoint[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    try {
      const raw = await readFile(join(dir, name), "utf-8");
      const { meta } = parseFrontmatter(raw);
      checkpoints.push(meta as unknown as Checkpoint);
    } catch {
      continue;
    }
  }
  return checkpoints;
}
