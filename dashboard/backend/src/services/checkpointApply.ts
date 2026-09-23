import { createHash, randomBytes } from "node:crypto";
import { basename, isAbsolute, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export interface ApplicableCheckpoint {
  id: string;
  title: string;
  category?: string | null;
  appliesTo?: string[] | null;
  checklist?: string[] | null;
  learnedFrom?: string | null;
}

export interface CheckpointApplyResult {
  applied: Array<{ projectPath: string; file: string }>;
  skipped: Array<{ projectPath: string; reason: string }>;
  conflicts: Array<{ projectPath: string; file: string; reason: string }>;
  failed: Array<{ projectPath: string; reason: string }>;
  unchanged: Array<{ projectPath: string; file: string }>;
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

function existingWasEdited(content: string): boolean {
  const match = content.match(/^content-hash:\s*([0-9a-f]{64})$/m);
  if (!match) return !content.includes("description: \"Sugo checkpoint ");
  const without = content.replace(/^content-hash:\s*[0-9a-f]{64}\n/m, "");
  return digest(without) !== match[1];
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
}): Promise<CheckpointApplyResult> {
  const result: CheckpointApplyResult = { applied: [], skipped: [], conflicts: [], failed: [], unchanged: [] };
  const category = safeSegment(input.checkpoint.category ?? "general", "general");
  const id = safeSegment(input.checkpoint.id, newCheckpointId());
  const content = managedContent(input.checkpoint, input.workspace);
  for (const projectPath of input.projectPaths) {
    try {
      if (!isAbsolute(projectPath)) {
        result.failed.push({ projectPath, reason: "등록된 프로젝트 경로가 절대경로가 아닙니다." });
        continue;
      }
      if (!await projectMatch(projectPath, input.checkpoint.appliesTo ?? [])) {
        result.skipped.push({ projectPath, reason: "적용 대상과 일치하지 않습니다." });
        continue;
      }
      const dir = join(projectPath, ".claude", "rules", category);
      const file = join(dir, `${id}-${slug(input.checkpoint.title)}.md`);
      const existing = await readFile(file, "utf8").catch(() => null);
      if (existing === content) {
        result.unchanged.push({ projectPath, file });
        continue;
      }
      if (existing !== null && existingWasEdited(existing)) {
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
