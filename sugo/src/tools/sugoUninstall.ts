import { access, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { sugoHomeDir } from "../homeDir.js";
import { loadInstallManifest, type InstallManifest } from "../harness/installManifest.js";
import { loadRegistry } from "../harness/registry.js";
import { syncProjectHarness } from "../harness/sync.js";
import { createHash } from "node:crypto";
import type { FileBaseline } from "../harness/installManifest.js";

const CONFIRMATION = "DELETE_SUGO_DATA";

export const sugoUninstallInputSchema = {
  action: z.enum(["preview", "execute", "restore", "discard"]).default("preview"),
  mode: z.enum(["retain", "purge"]).default("retain"),
  confirmation: z.string().optional().describe("retain execute: UNINSTALL_SUGO, purge execute: DELETE_SUGO_DATA, discard: DELETE_RETAINED_DATA"),
};
const Args = z.object(sugoUninstallInputSchema);

function withoutManagedBlock(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) return content;
  let before = content.slice(0, startIndex);
  const after = content.slice(endIndex + end.length);
  if (!after && before.endsWith("\n\n")) before = before.slice(0, -1);
  return before + after;
}

async function restoreRoot(path: string, original: FileBaseline | string | null, start: string, end: string): Promise<void> {
  const current = await readFile(path, "utf8").catch(() => null);
  if (current === null) return;
  const stripped = withoutManagedBlock(current, start, end);
  if (typeof original === "string" && stripped.startsWith(original) && stripped.slice(original.length).trim() === "") return writeFile(path, original);
  if (original && typeof original === "object" && original.existed) {
    const bytes = Buffer.from(stripped); const prefix = bytes.subarray(0, original.byteLength).toString();
    const matches = createHash("sha256").update(prefix).digest("hex") === original.sha256 && bytes.subarray(original.byteLength).toString().trim() === "";
    return writeFile(path, matches ? prefix : stripped);
  }
  if ((original === null || (typeof original === "object" && !original.existed)) && stripped.trim() === "") return rm(path, { force: true });
  await writeFile(path, stripped);
}

async function pruneEmptyParents(path: string, stopAt: string): Promise<void> {
  let current = dirname(path);
  while (current.startsWith(stopAt) && current !== stopAt) {
    const removed = await rmdir(current).then(() => true, () => false);
    if (!removed) break;
    current = dirname(current);
  }
}

async function cleanupProject(projectPath: string, manifest: InstallManifest | null) {
  const preserved: string[] = [];
  if (manifest) {
    await restoreRoot(join(projectPath, "CLAUDE.md"), manifest.rootClaudeOriginal,
      "<!-- sugo:harness-rules:start -->", "<!-- sugo:harness-rules:end -->");
    await restoreRoot(join(projectPath, "AGENTS.md"), manifest.rootAgentsOriginal,
      "<!-- sugo:project-context:start -->", "<!-- sugo:project-context:end -->");
    if (manifest.sugoDirExisted) {
      for (const rel of manifest.managedFiles) {
        const path = join(projectPath, rel);
        await rm(path, { force: true, recursive: true });
        await pruneEmptyParents(path, join(projectPath, "sugo"));
      }
      await rm(join(projectPath, "sugo", "install-manifest.json"), { force: true });
      await rmdir(join(projectPath, "sugo")).catch(() => {});
      preserved.push("sugo/ (설치 전부터 존재하여 소유권 불명 파일 보존)");
    } else {
      await rm(join(projectPath, "sugo"), { force: true, recursive: true });
    }
    for (const rel of manifest.managedFiles.filter((path) => path.startsWith(".claude/rules/"))) {
      await rm(join(projectPath, rel), { force: true });
      await rmdir(dirname(join(projectPath, rel))).catch(() => {});
    }
  } else {
    preserved.push("소유권 manifest 없음: 프로젝트 파일을 보존함");
  }
  return preserved;
}

export async function handleSugoUninstall(rawArgs: unknown) {
  const args = Args.parse(rawArgs);
  const activeRoot = join(sugoHomeDir(), ".claude", "sugo");
  const productRoot = join(sugoHomeDir(), ".sugo");
  const archiveRoot = join(productRoot, "data");
  if (args.action === "discard") {
    if (args.confirmation !== "DELETE_RETAINED_DATA") return error("CONFIRMATION_REQUIRED", "confirmation에 DELETE_RETAINED_DATA를 정확히 입력해야 합니다.");
    await rm(archiveRoot, { recursive: true, force: true });
    return result({ ok: true, action: "discard", retainedDataRemoved: true });
  }
  if (args.action === "restore") {
    const archivedRegistry = await readFile(join(archiveRoot, "registry.json"), "utf8").then(JSON.parse, () => null) as Array<{ path: string; workspace?: string }> | null;
    if (!archivedRegistry) return error("NO_RETAINED_DATA", "복구할 비활성 Sugo 데이터가 없습니다.");
    await rm(activeRoot, { recursive: true, force: true });
    await mkdir(dirname(activeRoot), { recursive: true });
    await rename(archiveRoot, activeRoot);
    for (const entry of archivedRegistry) await syncProjectHarness({ projectPath: resolve(entry.path), workspace: entry.workspace });
    return result({ ok: true, action: "restore", restoredProjects: archivedRegistry.length, active: true });
  }
  const projects = await loadRegistry();
  const preview = await Promise.all(projects.map(async ({ path }) => ({
    projectPath: resolve(path),
    ownershipRecorded: (await loadInstallManifest(resolve(path))) !== null,
  })));
  const requiredConfirmation = args.mode === "purge" ? CONFIRMATION : "UNINSTALL_SUGO";
  if (args.action === "preview") return result({ ok: true, action: "preview", mode: args.mode, requiredConfirmation, projects: preview, retainedDataPath: args.mode === "retain" ? archiveRoot : null });
  if (args.confirmation !== requiredConfirmation) return error("CONFIRMATION_REQUIRED", `confirmation에 ${requiredConfirmation}를 정확히 입력해야 합니다.`);

  const preserved: Array<{ projectPath: string; paths: string[] }> = [];
  for (const { path } of projects) {
    const projectPath = resolve(path);
    const paths = await cleanupProject(projectPath, await loadInstallManifest(projectPath));
    if (paths.length) preserved.push({ projectPath, paths });
  }
  if (args.mode === "retain") {
    await mkdir(productRoot, { recursive: true });
    await rm(archiveRoot, { recursive: true, force: true });
    if (await access(activeRoot).then(() => true, () => false)) await rename(activeRoot, archiveRoot);
  } else {
    await rm(activeRoot, { recursive: true, force: true });
    await rm(productRoot, { recursive: true, force: true });
  }
  const verifiedClean = !(await access(activeRoot).then(() => true, () => false));
  return result({ ok: true, action: "execute", mode: args.mode, verifiedClean, cleanedProjects: projects.length, retainedDataPath: args.mode === "retain" ? archiveRoot : null, preserved });
}

function result(body: object): { isError?: boolean; content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }] };
}
function error(errorCode: string, message: string) {
  return { isError: true, ...result({ ok: false, errorCode, message }) };
}
