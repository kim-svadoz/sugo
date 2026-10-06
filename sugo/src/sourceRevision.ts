import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve, isAbsolute } from "node:path";
import { runGit } from "./prRefs.js";
export interface SourceRevision { projectPath: string; commit?: string; recordedAt: string; state: "committed" | "pending"; files: { path: string; hash: string }[]; }
export async function collectSourceRevision(projectPath: string, changedFiles: string[], startedAt: string): Promise<SourceRevision | undefined> {
  const paths = [...new Set(changedFiles.map(f => relative(projectPath, resolve(projectPath, f)).replace(/\\/g, "/")))].sort();
  if (!paths.length || paths.some(p => !p || p.startsWith("../") || isAbsolute(p))) return undefined;
  const head = await runGit(["rev-parse", "HEAD"], projectPath);
  if (!head || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) return undefined;
  const files = [];
  for (const path of paths) {
    try { files.push({ path, hash: createHash("sha256").update(await readFile(resolve(projectPath, path))).digest("hex") }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") return undefined; files.push({ path, hash: "deleted" }); }
  }
  const status = await runGit(["status", "--porcelain", "--", ...paths], projectPath);
  const time = await runGit(["log", "-1", "--format=%ct", "--", ...paths], projectPath);
  const committed = status === "" && Number(time) >= Math.floor(Date.parse(startedAt) / 1000);
  return { projectPath, commit: committed ? head : undefined, recordedAt: new Date().toISOString(), state: committed ? "committed" : "pending", files };
}
