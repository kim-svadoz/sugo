import { createHash, randomBytes } from "node:crypto";
import { basename, isAbsolute, join } from "node:path";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

export interface ApplicableCheckpoint {
  id: string;
  title: string;
  category?: string | null;
  appliesTo?: string[] | null;
  checklist?: string[] | null;
  learnedFrom?: string | null;
  expiresAt?: string | null;
}

export interface CheckpointApplyResult {
  applied: Array<{ projectPath: string; file: string }>;
  skipped: Array<{ projectPath: string; reason: string }>;
  conflicts: Array<{ projectPath: string; file: string; reason: string }>;
  failed: Array<{ projectPath: string; reason: string }>;
  unchanged: Array<{ projectPath: string; file: string }>;
  removed: Array<{ projectPath: string; file: string }>;
}

/** DATE 값은 KST 기준 해당 날짜의 끝까지 유효하다. */
function dateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function isCheckpointExpired(expiresAt: string | Date | null | undefined, now = new Date()): boolean {
  const date = dateOnly(expiresAt);
  if (!date) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const todayKst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return date < todayKst;
}

export function newCheckpointId(): string {
  return `CP-${randomBytes(4).toString("hex")}`;
}

function safeSegment(value: string, fallback: string): string {
  const segment = value.trim() || fallback;
  if (segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")) {
    throw new Error(`invalid path segment: ${value}`);
  }
  return segment;
}

function slug(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "") || "checkpoint";
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bodyWithoutHash(checkpoint: ApplicableCheckpoint, workspace: string): string {
  const applies = checkpoint.appliesTo?.length ? `적용 대상: ${checkpoint.appliesTo.join(", ")}` : "도메인 전체 적용";
  return [
    "---",
    "sugo-managed: checkpoint",
    `checkpoint-id: ${checkpoint.id}`,
    ...(dateOnly(checkpoint.expiresAt) ? [`expires-at: ${dateOnly(checkpoint.expiresAt)}`] : []),
    `description: "Sugo checkpoint ${checkpoint.id} · ${workspace}"`,
    "---",
    "",
    "> 이 파일은 Sugo Dashboard가 관리합니다. 수정은 대시보드 체크포인트에서 진행하세요.",
    "",
    `# ${checkpoint.title}`,
    "",
    `> ${workspace} 도메인의 재발방지 컨텍스트 · ${applies}`,
    "",
    ...(checkpoint.learnedFrom?.trim()
      ? [checkpoint.learnedFrom.trim()]
      : (checkpoint.checklist ?? []).map((item) => `- ${item}`)),
    "",
  ].join("\n");
}

function managedContent(checkpoint: ApplicableCheckpoint, workspace: string): string {
  const body = bodyWithoutHash(checkpoint, workspace);
  return body.replace("checkpoint-id:", `content-hash: ${digest(body)}\ncheckpoint-id:`);
}

function legacyPluginContent(checkpoint: ApplicableCheckpoint, workspace: string): string {
  return [
    "---",
    `description: \"Sugo checkpoint ${checkpoint.id} · ${workspace}\"`,
    "---",
    "",
    `# ${checkpoint.title}`,
    "",
    `> ${workspace} 도메인의 재발방지 컨텍스트 · ${checkpoint.appliesTo?.length ? `적용 대상: ${checkpoint.appliesTo.join(", ")}` : "도메인 전체 적용"}`,
    "",
    ...(checkpoint.checklist ?? []).map((item) => `- ${item}`),
  ].join("\n");
}

function existingWasEdited(content: string, checkpoint: ApplicableCheckpoint, workspace: string): boolean {
  const match = content.match(/^content-hash:\s*([0-9a-f]{64})$/m);
  // 0.6.1 자동 pull은 hash 없이 고정 포맷으로 썼다. 현재 원격 데이터로 재구성한 원문과 정확히
  // 같을 때만 안전한 구형 관리 파일로 인정한다. 조금이라도 다르면 사람 수정 가능성이므로 충돌.
  if (!match) return content !== legacyPluginContent(checkpoint, workspace);
  const without = content.replace(/^content-hash:\s*[0-9a-f]{64}\n/m, "");
  return digest(without) !== match[1];
}

async function findCheckpointFiles(projectPath: string, checkpointId: string): Promise<string[]> {
  const root = join(projectPath, ".claude", "rules");
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const content = await readFile(path, "utf8").catch(() => "");
        if (content.includes(`checkpoint-id: ${checkpointId}`) || content.includes(`Sugo checkpoint ${checkpointId} ·`)) found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

async function removeManagedFiles(
  projectPath: string,
  files: string[],
  result: CheckpointApplyResult,
  reason: string,
  checkpoint: ApplicableCheckpoint,
  workspace: string,
): Promise<void> {
  for (const file of files) {
    const content = await readFile(file, "utf8").catch(() => null);
    if (content === null) continue;
    if (existingWasEdited(content, checkpoint, workspace)) {
      result.conflicts.push({ projectPath, file, reason });
      continue;
    }
    await rm(file, { force: true });
    result.removed.push({ projectPath, file });
  }
}

async function projectMatch(projectPath: string, appliesTo: string[]): Promise<boolean> {
  if (appliesTo.length === 0) return true;
  let projectName = basename(projectPath);
  let harnessIds: string[] = [];
  try {
    const config = JSON.parse(await readFile(join(projectPath, "sugo", "config.json"), "utf8")) as {
      projectName?: string;
      detectedStack?: { harnessIds?: string[] };
    };
    projectName = config.projectName ?? projectName;
    harnessIds = config.detectedStack?.harnessIds ?? [];
  } catch {
    // 등록 경로 이름으로는 계속 판정할 수 있다.
  }
  return appliesTo.some((target) => target === projectName || harnessIds.includes(target));
}

export async function applyCheckpointToProjects(input: {
  workspace: string;
  checkpoint: ApplicableCheckpoint;
  projectPaths: string[];
}, now = new Date()): Promise<CheckpointApplyResult> {
  const result: CheckpointApplyResult = { applied: [], skipped: [], conflicts: [], failed: [], unchanged: [], removed: [] };
  const category = safeSegment(input.checkpoint.category ?? "general", "general");
  const id = safeSegment(input.checkpoint.id, newCheckpointId());
  const content = managedContent(input.checkpoint, input.workspace);
  for (const projectPath of input.projectPaths) {
    try {
      if (!isAbsolute(projectPath)) {
        result.failed.push({ projectPath, reason: "등록된 프로젝트 경로가 절대경로가 아닙니다." });
        continue;
      }
      const existingFiles = await findCheckpointFiles(projectPath, id);
      if (isCheckpointExpired(input.checkpoint.expiresAt, now)) {
        await removeManagedFiles(projectPath, existingFiles, result, "체크포인트가 만료됐지만 rules 파일에 직접 수정된 내용이 있어 자동 제거하지 않았습니다.", input.checkpoint, input.workspace);
        result.skipped.push({ projectPath, reason: "유효기간이 지난 체크포인트입니다." });
        continue;
      }
      if (!await projectMatch(projectPath, input.checkpoint.appliesTo ?? [])) {
        await removeManagedFiles(projectPath, existingFiles, result, "적용 대상에서 제외됐지만 rules 파일에 직접 수정된 내용이 있어 자동 제거하지 않았습니다.", input.checkpoint, input.workspace);
        result.skipped.push({ projectPath, reason: "적용 대상과 일치하지 않습니다." });
        continue;
      }
      const dir = join(projectPath, ".claude", "rules", category);
      const file = join(dir, `${id}-${slug(input.checkpoint.title)}.md`);
      await removeManagedFiles(projectPath, existingFiles.filter((path) => path !== file), result, "체크포인트 경로가 바뀌었지만 이전 rules 파일에 직접 수정된 내용이 있어 자동 제거하지 않았습니다.", input.checkpoint, input.workspace);
      const existing = await readFile(file, "utf8").catch(() => null);
      if (existing === content) {
        result.unchanged.push({ projectPath, file });
        continue;
      }
      if (existing !== null && existingWasEdited(existing, input.checkpoint, input.workspace)) {
        result.conflicts.push({ projectPath, file, reason: "rules 파일에 직접 수정된 내용이 있어 덮어쓰지 않았습니다." });
        continue;
      }
      await mkdir(dir, { recursive: true });
      await writeFile(file, content, "utf8");
      result.applied.push({ projectPath, file });
    } catch (error) {
      result.failed.push({ projectPath, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
