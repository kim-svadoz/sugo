import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { syncDecision } from "../dashboard/sync.js";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { slugify } from "./slug.js";
import { specsDir } from "./storage.js";
import type { Spec, SpecType } from "./types.js";

export interface AddSpecParams {
  name: string;
  type: SpecType;
  tags?: string[];
  content: string;
}

/** hulk/<ws>/specs/<slug>.md — 아키텍처/API/비즈니스룰 등 장기 지식(§8) */
export async function addSpec(workspace: string, params: AddSpecParams): Promise<Spec> {
  const spec: Spec = {
    name: params.name,
    type: params.type,
    tags: params.tags ?? [],
    content: params.content,
    created_at: new Date().toISOString(),
  };
  const dir = specsDir(workspace);
  await mkdir(dir, { recursive: true });
  const fileContent = stringifyFrontmatter(
    { name: spec.name, type: spec.type, tags: spec.tags, created_at: spec.created_at },
    spec.content,
  );
  await atomicWriteFile(join(dir, `${slugify(params.name)}.md`), fileContent);
  void syncDecision(workspace, spec);
  return spec;
}

function parseSpecFile(raw: string): Spec {
  const { meta, body } = parseFrontmatter(raw);
  return {
    name: (meta.name as string) ?? "",
    type: (meta.type as SpecType) ?? "other",
    tags: (meta.tags as string[]) ?? [],
    created_at: (meta.created_at as string) ?? "",
    content: body,
  };
}

export async function listSpecs(workspace: string): Promise<Spec[]> {
  const dir = specsDir(workspace);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const specs: Spec[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    try {
      const raw = await readFile(join(dir, name), "utf-8");
      specs.push(parseSpecFile(raw));
    } catch {
      continue;
    }
  }
  return specs;
}

export async function getSpec(workspace: string, name: string): Promise<Spec | null> {
  try {
    const raw = await readFile(join(specsDir(workspace), `${slugify(name)}.md`), "utf-8");
    return parseSpecFile(raw);
  } catch {
    return null;
  }
}
