import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { basename, resolve, relative, isAbsolute } from "node:path";
import type { DbClient } from "../db/client.js";
import { parseMaybeJson } from "../db/jsonColumn.js";
import { linkAwsDeployments, type AwsDeploymentSnapshot, type ProjectIntegrationSelection } from "./awsDeploymentLink.js";
import { localLegacyWorkResults, recoverLegacySource, type DeploymentSource } from "./legacyDeploymentSource.js";
const exec = promisify(execFile);
// Cache only immutable object comparisons; working tree and HEAD are always read fresh.
const gitCache = new Map<string, { expires: number; value: Promise<string | null> }>();
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ORDER = ["dev", "stg", "prd"];
export interface DeploymentServiceEvidence { project: string; service: string; account: string; observedAt: string | null; images: string[]; commits: string[]; state: "confirmed" | "unknown"; reason?: string; }
export interface DeploymentEnvironment { environment: string; included: number; total: number; unknown: boolean; services: DeploymentServiceEvidence[]; }
export interface SpecDeployment { environment: "LOCAL" | "DEV" | "STG" | "PRD" | "UNKNOWN"; partial: boolean; total: number; environments: DeploymentEnvironment[]; stale?: boolean; reason?: string; sources?: { taskId: string; project: string | null; commit: string | null; state: string; patchVersion?: number; recoveredFrom?: string; summary?: string }[]; }
export function summarizeDeployment(environments: DeploymentEnvironment[], total: number): SpecDeployment {
  if (total === 0) return { environment: "UNKNOWN", partial: false, total, environments, reason: "아직 완료된 개발 작업이 없어 배포 환경을 판단할 수 없습니다." };
  const positive = environments.filter(e => e.included > 0).sort((a, b) => ORDER.indexOf(b.environment) - ORDER.indexOf(a.environment));
  const highest = positive[0];
  if (highest) return { environment: highest.environment.toUpperCase() as SpecDeployment["environment"], partial: highest.included < total, total, environments };
  const unknown = total > 0 && (environments.length === 0 || environments.some(e => e.unknown));
  return { environment: unknown ? "UNKNOWN" : "LOCAL", partial: false, total, environments, reason: unknown ? "커밋 또는 실제 배포 이미지의 연결 근거를 확인하지 못했습니다." : undefined };
}
function latestTaskSummary(value: unknown): string | undefined {
  const work = parseMaybeJson<any>(value, {});
  const summary = work?.summary ?? work?.report?.summary;
  return typeof summary === "string" ? summary.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 240) : undefined;
}
type Source = DeploymentSource;
export interface DeploymentNode { id: string; level: string; parent: string | null; status: string; manual_status?: string | null; work_result?: unknown; project_path?: string | null; }
async function git(project: string, args: string[]): Promise<string | null> {
  const immutable = ["cat-file", "merge-base", "show"].includes(args[0]) || (args[0] === "log" && args[1]?.includes("..")) || (args[0] === "rev-parse" && args[1]?.includes(":"));
  const key = JSON.stringify([project, args]);
  const cached = immutable ? gitCache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async () => { try { return (await exec("git", ["-C", project, ...args], { timeout: 3000, maxBuffer: 1024 * 1024 })).stdout.trim(); } catch { return null; } })();
  if (immutable) { if (gitCache.size >= 500) gitCache.delete(gitCache.keys().next().value!); gitCache.set(key, { expires: Date.now() + 30_000, value }); }
  return value;
}
function safePaths(project: string, files: Source["files"]): boolean {
  return Array.isArray(files) && !!files.length && files.every(f => !!f && typeof f.path === "string" && !isAbsolute(f.path) && !relative(project, resolve(project, f.path)).startsWith("..") && /^(?:[a-f0-9]{64}|deleted)$/.test(f.hash));
}
async function recordedSnapshotCommit(project: string, source: Source): Promise<string | null> {
  if (!Number.isFinite(Date.parse(source.recordedAt ?? "")) || !safePaths(project, source.files)) return null;
  const paths = source.files!.map(file => file.path);
  const history = await git(project, ["log", "--all", "--format=%H", "-200", `--since=${source.recordedAt}`, "--", ...paths]);
  if (history === null) return null;
  for (const commit of history.split("\n").filter(value => SHA.test(value))) {
    let matches = true;
    for (const file of source.files!) {
      if (file.hash === "deleted") {
        if (await git(project, ["ls-tree", commit, "--", file.path]) !== "") { matches = false; break; }
        continue;
      }
      try {
        const content = (await exec("git", ["-C", project, "show", `${commit}:${file.path}`], { timeout: 3000, maxBuffer: 2 * 1024 * 1024 })).stdout;
        const normalized = source.hashEncoding === "lf" ? content.replace(/\r\n/g, "\n") : content;
        if (createHash("sha256").update(normalized).digest("hex") !== file.hash) { matches = false; break; }
      } catch { matches = false; break; }
    }
    // The checked-out branch can differ from the branch that AWS actually deployed.
    // Prefer the newest exact snapshot; deployment ancestry is proved separately
    // against the immutable runtime commit in commitIncluded().
    if (matches) return commit;
  }
  return null;
}
async function resolveSource(source: Source, owned: Set<string>): Promise<Source | null> {
  if (!source || typeof source !== "object" || !owned.has(source.projectPath)) return null;
  if (source.state === "committed" && SHA.test(source.commit ?? "")) return source;
  if (source.state === "unknown") return source;
  if (source.state !== "pending" || !safePaths(source.projectPath, source.files)) return null;
  const paths = source.files!.map(f => f.path);
  const status = await git(source.projectPath, ["status", "--porcelain", "--", ...paths]);
  if (status === null) return source;
  if (status !== "") {
    const commit = await recordedSnapshotCommit(source.projectPath, source);
    return commit && SHA.test(commit) ? { ...source, commit, state: "committed" } : source;
  }
  let currentMatches = true;
  for (const f of source.files!) {
    let hash: string;
    try { hash = createHash("sha256").update(source.hashEncoding === "lf" ? (await readFile(resolve(source.projectPath, f.path), "utf8")).replace(/\r\n/g, "\n") : await readFile(resolve(source.projectPath, f.path))).digest("hex"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") return source; hash = "deleted"; }
    if (hash !== f.hash) currentMatches = false;
  }
  const time = currentMatches ? await git(source.projectPath, ["log", "-1", "--format=%ct", "--", ...paths]) : null;
  const commit = currentMatches && Number(time) >= Math.floor(Date.parse(source.recordedAt ?? "") / 1000)
    ? await git(source.projectPath, ["rev-parse", "HEAD"])
    : await recordedSnapshotCommit(source.projectPath, source);
  return commit && SHA.test(commit) ? { ...source, commit, state: "committed" } : source;
}
/** Direct ancestry, or identical changed-file blobs after squash/cherry-pick. Never compare mutable branch names. */
export async function commitIncluded(project: string, source: Source, deployed: string): Promise<boolean | null> {
  if (!SHA.test(source.commit ?? "") || !SHA.test(deployed)) return null;
  if (source.commit === deployed) return true;
  const ancestor = await git(project, ["merge-base", "--is-ancestor", source.commit!, deployed]);
  if (ancestor === "") {
    const messages = await git(project, ["log", `${source.commit}..${deployed}`, "--format=%B"]);
    if (messages === null) return null;
    return !messages.includes(`This reverts commit ${source.commit}`);
  }
  const objects = await git(project, ["cat-file", "-e", `${source.commit}^{commit}`]);
  const target = await git(project, ["cat-file", "-e", `${deployed}^{commit}`]);
  if (objects !== "" || target !== "") return null;
  if (safePaths(project, source.files)) {
    let equal = true;
    for (const file of source.files!) {
      const before = await git(project, ["rev-parse", `${source.commit}:${file.path}`]);
      const after = await git(project, ["rev-parse", `${deployed}:${file.path}`]);
      if (file.hash === "deleted") { if (before !== null || after !== null) equal = false; }
      else if (!before || before !== after) equal = false;
    }
    if (equal && await git(project, ["cat-file", "-e", `${deployed}^{commit}`]) === "") return true;
  }
  return false;
}
function imageRepository(image: unknown): string | null {
  return typeof image === "string" ? image.split("@")[0].replace(/:[^/:]+$/, "") : null;
}
function buildspecRepositoryMatches(buildspec: string, image: string, sameAccount: boolean): boolean {
  const variable = (name: string) => buildspec.match(new RegExp(`^\\s*${name}:\\s*["']?([^\\s"']+)`, "m"))?.[1];
  const registry = variable("ECR_URI"), repository = variable("REPOSITORY_NAME");
  return registry && repository ? `${registry}/${repository}` === imageRepository(image) : sameAccount;
}
export async function resolveDeployedCommits(project: string, metadata: any, snapshot: AwsDeploymentSnapshot, buildSnapshots: AwsDeploymentSnapshot[] = [snapshot]): Promise<string[] | null> {
  const runtime = Array.isArray(metadata.runtimeImages) ? metadata.runtimeImages : [];
  const images = runtime.filter((i: any) => typeof i.image === "string" && i.image.split("/").at(-1)?.split(/[:@]/)[0] === basename(project));
  if (metadata.runtimeError || !images.length || images.length < Number(metadata.runningCount ?? 0)) return null;
  // Successful build number -> source SHA is immutable; its age does not change the mapping.
  const builds = buildSnapshots.filter(s => s.observedAt && Number.isFinite(Date.parse(s.observedAt)) && Date.now() >= Date.parse(s.observedAt)).flatMap(s => s.inventory).filter(i => i.service === "codepipeline").flatMap(i => i.resources).filter(r => String(r.metadata?.repositoryName ?? "").split("/").at(-1)?.toLowerCase() === basename(project).toLowerCase()).flatMap(r => Array.isArray(r.metadata?.buildHistory) ? r.metadata!.buildHistory as any[] : []);
  const commits: string[] = [];
  for (const image of images) {
    if (!image.imageDigest) return null;
    const tags: string[] = Array.isArray(image.tags) ? image.tags : [];
    const candidates = new Set<string>(tags.filter(tag => SHA.test(tag)));
    for (const build of builds) {
      if (!SHA.test(build.commit ?? "")) continue;
      if (build.imageDigest === image.imageDigest && imageRepository(build.imageUri) === imageRepository(image.image)) { candidates.add(build.commit); continue; }
      if (!tags.includes(String(build.number))) continue;
      // Numeric tags are accepted only when this exact build commit's buildspec proves the convention.
      const buildspec = await git(project, ["show", `${build.commit}:buildspec.yml`]);
      if (buildspec && buildspecRepositoryMatches(buildspec, image.image, buildSnapshots.length === 1 && buildSnapshots[0].accountName === snapshot.accountName) && /IMAGE_TAG=\$\{?CODEBUILD_BUILD_NUMBER\}?/.test(buildspec) && /docker push[^\n]*\$\{IMAGE_TAG\}/.test(buildspec)) candidates.add(build.commit);
    }
    if (candidates.size !== 1) return null;
    commits.push([...candidates][0]);
  }
  return [...new Set(commits)];
}
export async function projectSpecDeployments(db: DbClient, userId: string, workspace: string, nodes: DeploymentNode[]): Promise<Map<string, SpecDeployment>> {
  const result = new Map<string, SpecDeployment>();
  const specs = nodes.filter(n => n.level === "spec"); if (!specs.length) return result;
  let owned: Set<string>; let mappings: Map<string, ProjectIntegrationSelection[]>; let snapshots: AwsDeploymentSnapshot[];
  try {
    owned = new Set((await db.query<{ project_path: string }>("SELECT p.project_path FROM sugo_workspace_projects p JOIN sugo_workspaces w ON w.id = p.workspace_id WHERE w.user_id = ? AND w.name = ?", [userId, workspace])).map(r => r.project_path));
    mappings = new Map((await db.query<{ project_path: string; selections: unknown }>("SELECT project_path, selections FROM user_project_integration_mappings WHERE user_id = ?", [userId])).map(r => [r.project_path, parseMaybeJson(r.selections, [])]));
    const rows = await db.query<{ name: string; region: string; payload: unknown; observed_at: string | null }>("SELECT a.name, a.region, s.payload, s.observed_at FROM user_aws_context_accounts a LEFT JOIN user_aws_context_snapshots s ON s.user_id = a.user_id AND s.account_name = a.name WHERE a.user_id = ?", [userId]);
    snapshots = rows.map(r => ({ accountName: r.name, region: r.region, inventory: parseMaybeJson(r.payload, []), observedAt: r.observed_at }));
  } catch { return result; }
  if (!owned.size || !snapshots.length) return result;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const legacy = await localLegacyWorkResults(userId, workspace);
  const sourceMemo = new Map<string, Promise<Source | null>>(); const includeMemo = new Map<string, Promise<boolean | null>>(); const commitMemo = new Map<string, Promise<string[] | null>>();
  for (const spec of specs) {
    const tasks = nodes.filter(n => {
      if (n.level !== "task" || (n.manual_status ?? n.status) === "dropped") return false;
      let parent = n.parent; const seen = new Set<string>();
      while (parent && !seen.has(parent)) { if (parent === spec.id) return true; seen.add(parent); parent = byId.get(parent)?.parent ?? null; } return false;
    });
    const sources = await Promise.all(tasks.map(async task => {
      const work = parseMaybeJson<any>(task.work_result, {});
      if (work?.sourceRevision) return work.sourceRevision as Source;
      const original = legacy.get(task.id);
      // A later local patch must not be attached to an older synced report.
      const snapshot = original?.path === work?.path && original?.endedAt === work?.endedAt ? original : work;
      return await recoverLegacySource(snapshot, owned) ?? undefined;
    }));
    const paths = [...new Set([spec.project_path, ...sources.map(s => s?.projectPath)].filter((p): p is string => !!p && owned.has(p)))];
    if (!paths.length && owned.size === 1) paths.push([...owned][0]);
    const linked = paths.filter(path => linkAwsDeployments(path, snapshots, [], mappings.get(path)).length > 0 || !!mappings.get(path)?.length);
    if (!linked.length) continue;
    const resolved = await Promise.all(sources.map(source => { if (!source) return null; const key = JSON.stringify(source); if (!sourceMemo.has(key)) sourceMemo.set(key, resolveSource(source, owned)); return sourceMemo.get(key)!; }));
    const environments: DeploymentEnvironment[] = []; let stale = false;
    for (const environment of ORDER) {
      const serviceRows: Array<{ project: string; evidence: DeploymentServiceEvidence }> = [];
      for (const path of linked) {
        const deployments = linkAwsDeployments(path, snapshots, [], mappings.get(path)).filter(d => d.environment === environment);
        for (const deployment of deployments) {
          const snapshot = snapshots.find(s => s.accountName === deployment.accountName)!;
          const inventory = snapshot.inventory.find(i => i.service === "ecs");
          const metadata = inventory?.resources.find(r => r.kind === "service" && r.id === deployment.service && String(r.metadata?.cluster ?? "") === String(deployment.cluster ?? ""))?.metadata;
          // Settings may also link another repository's service to this project.
          // Only images of this TASK's source repository participate in its deployment verdict.
          const declaredImages = Array.isArray(metadata?.images) ? metadata.images as string[] : [];
          if (declaredImages.length && !declaredImages.some(image => imageRepository(image)?.split("/").at(-1) === basename(path))) continue;
          const fresh = snapshot.observedAt && Date.now() - Date.parse(snapshot.observedAt) <= 30 * 60_000 && Date.now() >= Date.parse(snapshot.observedAt);
          const observed = snapshot.observedAt && Number.isFinite(Date.parse(snapshot.observedAt)) && Date.now() >= Date.parse(snapshot.observedAt);
          if (observed && !fresh) stale = true;
          const stable = deployment.healthState === "HEALTHY" && (deployment.runningCount ?? 0) > 0 && !["IN_PROGRESS", "FAILED"].includes(deployment.rolloutState ?? "") && !inventory?.error;
          const key = JSON.stringify([path, snapshot.accountName, snapshot.observedAt, deployment.service, metadata]);
          if (!commitMemo.has(key)) commitMemo.set(key, observed && stable && metadata ? resolveDeployedCommits(path, metadata, snapshot, snapshots) : Promise.resolve(null));
          const commits = await commitMemo.get(key)!;
          serviceRows.push({ project: path, evidence: { project: path, service: deployment.service, account: snapshot.accountName, observedAt: snapshot.observedAt, images: Array.isArray(metadata?.runtimeImages) ? (metadata.runtimeImages as any[]).map(i => `${i.image} (${i.imageDigest ?? "digest 없음"})`) : deployment.images, commits: commits ?? [], state: commits ? "confirmed" : "unknown", reason: !observed ? "AWS 조회 시각을 확인하지 못했습니다." : !stable ? "배포 진행 중이거나 실행 상태를 확인하지 못했습니다." : !commits ? "실행 이미지와 빌드 커밋 연결을 확인하지 못했습니다." : !fresh ? "마지막 조회 당시의 배포 상태입니다. Settings에서 AWS 정보를 새로고침하세요." : undefined } });
        }
      }
      const configured = paths.some(path => mappings.get(path)?.some(m => m.environment === environment));
      if (!serviceRows.length && !configured) continue;
      let included = 0; let unknown = false;
      for (const source of resolved) {
        if (source?.state === "pending") continue;
        if (!source?.commit || !SHA.test(source.commit)) { unknown = true; continue; }
        const targets = serviceRows.filter(r => r.project === source.projectPath);
        if (!targets.length) { unknown = true; continue; }
        const checks = await Promise.all(targets.map(async r => {
          if (r.evidence.state === "unknown") return null;
          const values = await Promise.all(r.evidence.commits.map(commit => {
            const key = JSON.stringify([source, commit]); if (!includeMemo.has(key)) includeMemo.set(key, commitIncluded(source.projectPath, source, commit)); return includeMemo.get(key)!;
          }));
          return values.every(v => v === true) ? true : values.some(v => v === false) ? false : null;
        }));
        if (checks.every(v => v === true)) included++;
        else if (checks.some(v => v === null)) unknown = true;
      }
      environments.push({ environment, included, total: tasks.length, unknown, services: serviceRows.map(r => r.evidence) });
    }
    result.set(spec.id, { ...summarizeDeployment(environments, tasks.length), stale, sources: resolved.map((source, i) => ({ taskId: tasks[i].id, project: source?.projectPath ?? null, commit: source?.commit ?? null, state: source?.state ?? "unknown", patchVersion: parseMaybeJson<any>(tasks[i].work_result, {})?.patchVersion, recoveredFrom: source?.recoveredFrom, summary: latestTaskSummary(tasks[i].work_result) })) });
  }
  return result;
}
