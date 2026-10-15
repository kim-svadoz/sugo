import { access, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { sugoHomeDir } from "../homeDir.js";
import { loadInstallManifest, type InstallManifest } from "../harness/installManifest.js";
import { loadRegistry } from "../harness/registry.js";

const CONFIRMATION = "DELETE_SUGO_DATA";

export const sugoUninstallInputSchema = {
  action: z.enum(["preview", "execute"]).default("preview"),
  confirmation: z.string().optional().describe(`execute 시 정확히 ${CONFIRMATION}`),
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

async function restoreRoot(path: string, original: string | null, start: string, end: string): Promise<void> {
  const current = await readFile(path, "utf8").catch(() => null);
  if (current === null) return;
  const stripped = withoutManagedBlock(current, start, end);
  if (original !== null && stripped.startsWith(original) && stripped.slice(original.length).trim() === "") await writeFile(path, original);
  else if (original === null && stripped.trim() === "") await rm(path, { force: true });
  else await writeFile(path, stripped);
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
  const projects = await loadRegistry();
  const preview = await Promise.all(projects.map(async ({ path }) => ({
    projectPath: resolve(path),
    ownershipRecorded: (await loadInstallManifest(resolve(path))) !== null,
  })));
  if (args.action === "preview") return result({ ok: true, action: "preview", requiredConfirmation: CONFIRMATION, projects: preview });
  if (args.confirmation !== CONFIRMATION) return error("CONFIRMATION_REQUIRED", `confirmation에 ${CONFIRMATION}를 정확히 입력해야 합니다.`);

  const preserved: Array<{ projectPath: string; paths: string[] }> = [];
  for (const { path } of projects) {
    const projectPath = resolve(path);
    const paths = await cleanupProject(projectPath, await loadInstallManifest(projectPath));
    if (paths.length) preserved.push({ projectPath, paths });
  }
  const dataRoot = join(sugoHomeDir(), ".claude", "sugo");
  await rm(dataRoot, { recursive: true, force: true });
  const verifiedClean = !(await access(dataRoot).then(() => true, () => false));
  return result({ ok: true, action: "execute", verifiedClean, cleanedProjects: projects.length, preserved });
}

function result(body: object): { isError?: boolean; content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }] };
}
function error(errorCode: string, message: string) {
  return { isError: true, ...result({ ok: false, errorCode, message }) };
}
