import { access, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { sugoHomeDir } from "../homeDir.js";
import { loadInstallManifest, type InstallManifest } from "../harness/installManifest.js";
import { loadRegistry } from "../harness/registry.js";
import { syncProjectHarness } from "../harness/sync.js";
import { createHash } from "node:crypto";
import { currentSugoVersion } from "../version.js";
import { dashboardPaths, ensureDashboard, fetchHealth, readServerState, stopDashboard } from "../lifecycle/dashboardRuntime.js";
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

export interface UninstallDeps {
  /** restore가 대시보드를 다시 띄울 때 쓰는 플러그인 루트·빌드·포트. 기본은 실행 중인 번들 기준. */
  pluginRoot?: string;
  buildId?: string;
  port?: number;
}

const DASHBOARD_RUNNING_MESSAGE = "대시보드 서버를 멈추지 못했습니다. 서버 프로세스를 직접 종료한 뒤 다시 실행하세요. 아무 데이터도 옮기거나 지우지 않았습니다.";

export function handleSugoUninstall(rawArgs: unknown) {
  return uninstallSugo(rawArgs, {});
}

export async function uninstallSugo(rawArgs: unknown, deps: UninstallDeps) {
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
    // 재설치 뒤 첫 세션이 이미 새 대시보드를 띄웠을 수 있다. 데이터를 교체하기 전에 멈춘다.
    const paths = dashboardPaths();
    if (!(await stopDashboard(paths)).stopped) return error("DASHBOARD_STILL_RUNNING", DASHBOARD_RUNNING_MESSAGE);
    await rm(activeRoot, { recursive: true, force: true });
    await mkdir(dirname(activeRoot), { recursive: true });
    await rename(archiveRoot, activeRoot);
    // 보관 당시의 실행 기록은 지금 프로세스와 무관하다.
    await rm(paths.stateFile, { force: true });
    await rm(paths.lockDir, { recursive: true, force: true });
    for (const entry of archivedRegistry) await syncProjectHarness({ projectPath: resolve(entry.path), workspace: entry.workspace });
    const dashboard = await ensureDashboard({
      pluginRoot: deps.pluginRoot ?? join(dirname(process.argv[1] ?? ""), ".."),
      buildId: deps.buildId ?? currentSugoVersion(),
      port: deps.port,
    });
    return result({ ok: true, action: "restore", restoredProjects: archivedRegistry.length, active: true, dashboard: dashboard.kind });
  }
  const projects = await loadRegistry();
  const preview = await Promise.all(projects.map(async ({ path }) => ({
    projectPath: resolve(path),
    ownershipRecorded: (await loadInstallManifest(resolve(path))) !== null,
  })));
  const requiredConfirmation = args.mode === "purge" ? CONFIRMATION : "UNINSTALL_SUGO";
  const paths = dashboardPaths();
  if (args.action === "preview") {
    const state = await readServerState(paths);
    const dashboardRunning = state !== null && (await fetchHealth(state.port)) !== null;
    return result({ ok: true, action: "preview", mode: args.mode, requiredConfirmation, projects: preview, dashboardRunning, retainedDataPath: args.mode === "retain" ? archiveRoot : null });
  }
  if (args.confirmation !== requiredConfirmation) return error("CONFIRMATION_REQUIRED", `confirmation에 ${requiredConfirmation}를 정확히 입력해야 합니다.`);
  // 서버가 DB·로그를 열고 있는 채로 폴더를 옮기거나 지우면 안 된다(Windows는 실패한다). 되돌릴 수 없는 단계 전에 멈춘다.
  if (!(await stopDashboard(paths)).stopped) return error("DASHBOARD_STILL_RUNNING", DASHBOARD_RUNNING_MESSAGE);

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
