import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { config } from "../config.js";
const exec = promisify(execFile);
export interface DeploymentSource {
  projectPath: string; commit?: string; recordedAt?: string; state?: string;
  files?: { path: string; hash: string }[]; hashEncoding?: "lf";
  recoveredFrom?: "legacy_file_snapshot" | "legacy_recorded_commit";
}
function inside(root: string, path: string) {
  const rel = relative(root, path); return !!rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\");
}
function hash(content: string) { return createHash("sha256").update(content.replace(/\r\n/g, "\n")).digest("hex"); }
const cache = new Map<string, { expires: number; source: DeploymentSource | null }>();
const inFlight = new Map<string, Promise<DeploymentSource | null>>();
/** Resolve recorded task identity; deployment inclusion is checked separately against running images. */
export async function recoverLegacySource(result: any, owned: Set<string>): Promise<DeploymentSource | null> {
  if (!result?.path || !Number.isFinite(Date.parse(result.startedAt)) || !Number.isFinite(Date.parse(result.endedAt))) return null;
  const project = [...owned].filter(p => inside(p, resolve(result.path))).sort((a, b) => b.length - a.length)[0];
  if (!project) return null;
  if (!Array.isArray(result.files) || !result.files.length) {
    // Old direct-commit tasks sometimes stored their SHA only in the result summary.
    // Never accept arbitrary hex text, ambiguous references, or an inaccessible Git object.
    const summary = typeof result.summary === "string" ? result.summary : result.report?.summary;
    if (typeof summary !== "string") return null;
    const references = [...new Set([...summary.matchAll(/(?:커밋|\bcommit)\s*(?:[:=]\s*)?`?([a-f0-9]{7,40})\b/gi)].map(m => m[1].toLowerCase()))];
    if (references.length !== 1) return null;
    try {
      const object = await exec("git", ["-C", project, "rev-parse", "--verify", `${references[0]}^{commit}`], { timeout: 3000 });
      const commit = object.stdout.trim(); if (!/^[a-f0-9]{40,64}$/.test(commit)) return null;
      const time = await exec("git", ["-C", project, "show", "-s", "--format=%ct", commit], { timeout: 3000 });
      if (Number(time.stdout.trim()) < Math.floor(Date.parse(result.startedAt) / 1000)) return null;
      return { projectPath: project, commit, recordedAt: result.endedAt, state: "committed", recoveredFrom: "legacy_recorded_commit" };
    } catch { return null; }
  }
  const files: { path: string; hash: string }[] = [];
  for (const file of result.files) {
    if (typeof file?.path !== "string" || !file.path) return null;
    const absolute = resolve(project, file.path);
    if (!inside(project, absolute) || (typeof file.content !== "string" && file.change !== "deleted")) return null;
    files.push({ path: relative(project, absolute).replace(/\\/g, "/"), hash: file.change === "deleted" ? "deleted" : hash(file.content) });
  }
  const source: DeploymentSource = { projectPath: project, recordedAt: result.endedAt, state: "unknown", files, hashEncoding: "lf", recoveredFrom: "legacy_file_snapshot" };
  const key = createHash("sha256").update(JSON.stringify([source, result.startedAt])).digest("hex");
  const cached = cache.get(key); if (cached && cached.expires > Date.now()) return cached.source;
  const existing = inFlight.get(key); if (existing) return existing;
  const pending = (async () => {
  try {
    const output = await exec("git", ["-C", project, "log", "--all", "--format=%H", "--reverse", "-200", `--since=${result.startedAt}`, "--", ...files.map(f => f.path)], { timeout: 5000, maxBuffer: 1024 * 1024 });
    for (const commit of output.stdout.trim().split("\n").filter(c => /^[a-f0-9]{40,64}$/.test(c))) {
      let matches = true;
      for (const file of files) {
        try {
          const blob = await exec("git", ["-C", project, "show", `${commit}:${file.path}`], { timeout: 3000, maxBuffer: 2 * 1024 * 1024 });
          if (file.hash === "deleted" || hash(blob.stdout) !== file.hash) { matches = false; break; }
        } catch {
          // An absent blob means deletion only after the commit object itself was found by log.
          if (file.hash !== "deleted") { matches = false; break; }
          try { const entry = await exec("git", ["-C", project, "ls-tree", commit, "--", file.path]); if (entry.stdout.trim()) matches = false; } catch { matches = false; }
        }
      }
      if (matches) { source.commit = commit; source.state = "committed"; break; }
    }
  } catch { /* A repository not accessible to this server is not proof of a commit. */ }
  if (source.state === "unknown") {
    try {
      const status = await exec("git", ["-C", project, "status", "--porcelain", "--", ...files.map(f => f.path)], { timeout: 3000 });
      if (status.stdout.trim()) {
        const matching = await Promise.all(files.map(async file => {
          try { return file.hash !== "deleted" && hash(await readFile(resolve(project, file.path), "utf8")) === file.hash; }
          catch (error) { return file.hash === "deleted" && (error as NodeJS.ErrnoException).code === "ENOENT"; }
        }));
        if (matching.every(Boolean)) source.state = "pending";
      }
    } catch { /* Unknown remains unknown. */ }
  }
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 30_000, source });
  return source;
  })();
  inFlight.set(key, pending);
  try { return await pending; } finally { inFlight.delete(key); }
}
/** Local owner's artifacts only; other dashboard users cannot read server-home workspaces. */
export async function localLegacyWorkResults(userId: string, workspace: string): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  if (!config.localDev.enabled || config.localDev.userId !== userId) return results;
  const work = join(homedir(), ".claude", "sugo", "work"); const directory = resolve(work, workspace);
  if (!inside(work, directory)) return results;
  try {
    const path = join(directory, "roadmap.json"); if ((await stat(path)).size > 10 * 1024 * 1024) return results;
    const document = JSON.parse(await readFile(path, "utf8"));
    for (const node of document.nodes ?? []) if (node.level === "task" && node.workResult) results.set(node.id, node.workResult);
  } catch { /* Legacy data is optional. */ }
  return results;
}
