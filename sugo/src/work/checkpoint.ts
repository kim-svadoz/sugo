import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { recordManagedFile } from "../harness/installManifest.js";
import { relative } from "node:path";
import { fetchCheckpointSync, type RemoteCheckpoint } from "../dashboard/fetch.js";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { slugify } from "./slug.js";
import { loadProjectConfig } from "../harness/config.js";
import { checkpointsDir } from "./storage.js";
import type { Checkpoint } from "./types.js";
import { checkpointApplies } from "./matching.js";

function generateCheckpointId(): string {
  return `CP-${randomBytes(4).toString("hex")}`;
}

export interface AddCheckpointParams {
  title: string;
  category?: string;
  applies_to?: string[];
  checklist: string[];
  expires_at?: string;
}

/** work/<ws>/checkpoints/CP-<id>-<slug>.md (frontmatter+본문) */
export async function addCheckpoint(workspace: string, params: AddCheckpointParams): Promise<Checkpoint> {
  const id = generateCheckpointId();
  const checkpoint: Checkpoint = {
    id,
    title: params.title,
    category: params.category,
    applies_to: params.applies_to,
    checklist: params.checklist,
    created_at: new Date().toISOString(),
    expires_at: params.expires_at,
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
    expires_at: checkpoint.expires_at ?? null,
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
 * sugo_checkpoint(migrate): 기존 체크포인트 파일을 현재 canonical frontmatter 포맷으로
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
      expires_at: checkpoint.expires_at ?? null,
    });
    await atomicWriteFile(join(dir, filename), content);
  }
  return entries.length;
}

/**
 * "/sugo:checkpoint-sync"(대시보드→로컬 pull): 원격 체크포인트를 프로젝트의
 * `.claude/rules/<category>/<slug>.md`로 기록한다(sugo_get_project_context가 읽는 바로 그
 * 위치). 대시보드가 꺼져있거나 응답이 없으면 null을 그대로 반환한다(호출부가
 * "가져온 게 없다"로 판단하게 — 에러가 아니다. 대시보드가 다운돼도 막지 않는다).
 */
export interface CheckpointReconcileResult {
  appliedCount: number;
  removedCount: number;
  conflicts: string[];
}

function todayLocal(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isExpired(expiresAt: string | undefined, now: Date): boolean {
  return !!expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt.slice(0, 10)) && expiresAt.slice(0, 10) < todayLocal(now);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function checkpointBody(cp: RemoteCheckpoint, workspace: string): string {
  const body = [
    "---",
    "sugo-managed: checkpoint",
    `checkpoint-id: ${cp.id}`,
    ...(cp.expires_at ? [`expires-at: ${cp.expires_at.slice(0, 10)}`] : []),
    `description: \"Sugo checkpoint ${cp.id} · ${workspace}\"`,
    "---",
    "",
    "> 이 파일은 Sugo Dashboard가 관리합니다. 수정은 대시보드 체크포인트에서 진행하세요.",
    "",
    `# ${cp.title}`,
    "",
    `> ${workspace} 워크스페이스의 재발방지 컨텍스트 · ${cp.applies_to?.length ? `적용 대상: ${cp.applies_to.join(", ")}` : "워크스페이스 전체 적용"}`,
    "",
    ...(cp.learned_from?.trim() ? [cp.learned_from.trim()] : cp.checklist.map((item) => `- ${item}`)),
    "",
  ].join("\n");
  return body.replace("checkpoint-id:", `content-hash: ${digest(body)}\ncheckpoint-id:`);
}

/** hash 없이 고정 포맷으로 쓰인 파일의 원문. 이미 쓰인 파일과 글자까지 같아야 하므로 문구를 바꾸지 않는다. */
function legacyCheckpointBody(cp: RemoteCheckpoint, workspace: string): string {
  return [
    "---",
    `description: \"Sugo checkpoint ${cp.id} · ${workspace}\"`,
    "---",
    "",
    `# ${cp.title}`,
    "",
    `> ${workspace} 도메인의 재발방지 컨텍스트 · ${cp.applies_to?.length ? `적용 대상: ${cp.applies_to.join(", ")}` : "도메인 전체 적용"}`,
    "",
    ...cp.checklist.map((item) => `- ${item}`),
  ].join("\n");
}

function wasEdited(content: string, cp: RemoteCheckpoint, workspace: string): boolean {
  const match = content.match(/^content-hash:\s*([0-9a-f]{64})$/m);
  if (!match) return content !== legacyCheckpointBody(cp, workspace);
  const without = content.replace(/^content-hash:\s*[0-9a-f]{64}\n/m, "");
  return digest(without) !== match[1];
}

async function checkpointFiles(projectPath: string, id: string): Promise<string[]> {
  const root = join(projectPath, ".claude", "rules");
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const content = await readFile(path, "utf8").catch(() => "");
        if (content.includes(`checkpoint-id: ${id}`) || content.includes(`Sugo checkpoint ${id} ·`)) found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

export async function syncRemoteCheckpointsToRules(
  projectPath: string,
  workspace: string,
  remote: RemoteCheckpoint[],
  context: { projectName: string; harnessIds: string[] },
  now = new Date(),
): Promise<CheckpointReconcileResult> {
  const result: CheckpointReconcileResult = { appliedCount: 0, removedCount: 0, conflicts: [] };
  for (const cp of remote) {
    const files = await checkpointFiles(projectPath, cp.id);
    const applicable = checkpointApplies(cp, context) && !isExpired(cp.expires_at, now);
    const target = join(projectPath, ".claude", "rules", cp.category ?? "general", `${cp.id}-${slugify(cp.title)}.md`);
    let blocked = false;
    for (const file of files.filter((path) => !applicable || path !== target)) {
      const content = await readFile(file, "utf8").catch(() => null);
      if (content === null) continue;
      if (wasEdited(content, cp, workspace)) {
        result.conflicts.push(file);
        blocked = true;
      } else {
        await rm(file, { force: true });
        result.removedCount += 1;
      }
    }
    if (!applicable || blocked) continue;
    const content = checkpointBody(cp, workspace);
    const existing = await readFile(target, "utf8").catch(() => null);
    if (existing !== null && existing !== content && wasEdited(existing, cp, workspace)) {
      result.conflicts.push(target);
      continue;
    }
    await mkdir(join(projectPath, ".claude", "rules", cp.category ?? "general"), { recursive: true });
    if (existing !== content) await atomicWriteFile(target, content);
    await recordManagedFile(projectPath, relative(projectPath, target).replace(/\\/g, "/"));
    result.appliedCount += 1;
  }
  return result;
}

export async function pullCheckpointsToRules(projectPath: string, workspace: string): Promise<number | null> {
  const remote = await fetchCheckpointSync(workspace);
  if (!remote) return null;
  const config = await loadProjectConfig(projectPath);
  const result = await syncRemoteCheckpointsToRules(projectPath, workspace, remote, {
    projectName: config?.projectName ?? "",
    harnessIds: config?.detectedStack.harnessIds ?? [],
  });
  return result.appliedCount;
}
