import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { fetchCheckpointSync } from "../dashboard/fetch.js";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { slugify } from "./slug.js";
import { checkpointsDir } from "../work/storage.js";
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
  const entries = await listCheckpointFiles(workspace);
  return entries.map((e) => e.checkpoint);
}

interface CheckpointFileEntry {
  filename: string;
  checkpoint: Checkpoint;
}

async function listCheckpointFiles(workspace: string): Promise<CheckpointFileEntry[]> {
  const dir = checkpointsDir(workspace);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const result: CheckpointFileEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    try {
      const raw = await readFile(join(dir, name), "utf-8");
      const { meta } = parseFrontmatter(raw);
      result.push({ filename: name, checkpoint: meta as unknown as Checkpoint });
    } catch {
      continue;
    }
  }
  return result;
}

export async function getCheckpoint(workspace: string, id: string): Promise<Checkpoint | null> {
  const entries = await listCheckpointFiles(workspace);
  return entries.find((e) => e.checkpoint.id === id)?.checkpoint ?? null;
}

/** id로 체크포인트 파일을 찾아 지운다. 없으면 false(조용히 실패하지 않고 호출부가 판단하게). */
export async function removeCheckpoint(workspace: string, id: string): Promise<boolean> {
  const entries = await listCheckpointFiles(workspace);
  const found = entries.find((e) => e.checkpoint.id === id);
  if (!found) return false;
  await rm(join(checkpointsDir(workspace), found.filename), { force: true });
  return true;
}

/**
 * §8 sugo_checkpoint(migrate): 기존 체크포인트 파일을 현재 canonical frontmatter 포맷으로
 * 다시 써서 정규화한다. 파일이 손상되거나 필드가 부분적으로만 있어도 항상 완전한 Checkpoint
 * 셰이프로 다시 쓰는 통로다.
 */
export async function migrateCheckpoints(workspace: string): Promise<number> {
  const entries = await listCheckpointFiles(workspace);
  const dir = checkpointsDir(workspace);
  for (const { filename, checkpoint } of entries) {
    const content = stringifyFrontmatter({
      id: checkpoint.id,
      title: checkpoint.title,
      category: checkpoint.category ?? null,
      applies_to: checkpoint.applies_to ?? [],
      checklist: checkpoint.checklist,
      created_at: checkpoint.created_at ?? new Date().toISOString(),
    });
    await atomicWriteFile(join(dir, filename), content);
  }
  return entries.length;
}

/**
 * §7.2 "/sugo:checkpoint-sync"(대시보드→로컬 pull): 원격 체크포인트를 프로젝트의
 * `.claude/rules/<category>/<slug>.md`로 기록한다(sugo_get_project_context가 읽는 바로 그
 * 위치, §1 레이아웃). 대시보드가 꺼져있거나 응답이 없으면 null을 그대로 반환한다(호출부가
 * "가져온 게 없다"로 판단하게 — 에러가 아니다, §7.2 "다운돼도 막지 않는다").
 */
export async function pullCheckpointsToRules(projectPath: string): Promise<number | null> {
  const remote = await fetchCheckpointSync();
  if (!remote) return null;
  for (const cp of remote) {
    const dir = join(projectPath, ".claude", "rules", cp.category ?? "general");
    await mkdir(dir, { recursive: true });
    const body = [`# ${cp.title}`, "", ...cp.checklist.map((item) => `- [ ] ${item}`)].join("\n");
    await atomicWriteFile(join(dir, `${slugify(cp.title)}.md`), body);
  }
  return remote.length;
}
