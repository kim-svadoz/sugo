import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { sugoHomeDir } from "./homeDir.js";

export interface SpecPathMapping { from: string; to: string }
export interface SpecStorageMigrationResult {
  migrated: number;
  alreadyMigrated: boolean;
  mappings: SpecPathMapping[];
  failures: string[];
}

interface MigrationMarker { version: 1; migratedAt: string; mappings: SpecPathMapping[] }

function legacySpecRoot(): string {
  return join(sugoHomeDir(), "dev", "spec");
}

export function managedSpecRoot(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "specs");
}

function markerPath(): string {
  return join(managedSpecRoot(), ".legacy-dev-spec-migrated.json");
}

async function exists(path: string): Promise<boolean> {
  return readFile(path).then(() => true, () => false);
}

async function hash(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function findLegacySpecs(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === "spec.md") found.push(full);
    }
  }
  await walk(root);
  return found.sort();
}

function validLegacyRelative(path: string): boolean {
  const parts = path.split(sep);
  return parts.length === 4 && /^\d{8}$/.test(parts[0]) && parts[1].length > 0 && /^v[1-9]\d*$/.test(parts[2]) && parts[3] === "spec.md";
}

async function nextTarget(source: string, sourceRoot: string, targetRoot: string): Promise<string> {
  const rel = relative(sourceRoot, source);
  const parts = rel.split(sep);
  const preferred = join(targetRoot, rel);
  if (!(await exists(preferred)) || (await hash(preferred)) === (await hash(source))) return preferred;
  const featureDir = join(targetRoot, parts[0], parts[1]);
  let version = 1;
  while (await exists(join(featureDir, `v${version}`, "spec.md"))) version += 1;
  return join(featureDir, `v${version}`, "spec.md");
}

async function copyVersionDirectory(sourceSpec: string, targetSpec: string): Promise<void> {
  await mkdir(dirname(targetSpec), { recursive: true });
  const entries = await readdir(dirname(sourceSpec), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === ".DS_Store") continue;
    const target = join(dirname(targetSpec), entry.name);
    if (!(await exists(target))) await copyFile(join(dirname(sourceSpec), entry.name), target);
  }
}

async function writeMarker(marker: MigrationMarker): Promise<void> {
  const path = markerPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(marker, null, 2) + "\n", "utf8");
  await rename(temp, path);
}

export async function migrateLegacySpecStorage(): Promise<SpecStorageMigrationResult> {
  const existingMarker = await readFile(markerPath(), "utf8").then((text) => JSON.parse(text) as MigrationMarker, () => null);
  if (existingMarker?.version === 1) {
    return { migrated: 0, alreadyMigrated: true, mappings: existingMarker.mappings, failures: [] };
  }

  const sourceRoot = legacySpecRoot();
  const sources = await findLegacySpecs(sourceRoot);
  if (sources.length === 0) return { migrated: 0, alreadyMigrated: false, mappings: [], failures: [] };

  const targetRoot = managedSpecRoot();
  const mappings: SpecPathMapping[] = [];
  const failures: string[] = [];
  for (const source of sources) {
    const rel = relative(sourceRoot, source);
    if (!validLegacyRelative(rel)) continue;
    try {
      const target = await nextTarget(source, sourceRoot, targetRoot);
      await copyVersionDirectory(source, target);
      mappings.push({ from: resolve(source), to: resolve(target) });
    } catch (error) {
      failures.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length === 0) await writeMarker({ version: 1, migratedAt: new Date().toISOString(), mappings });
  return { migrated: mappings.length, alreadyMigrated: false, mappings, failures };
}

export async function rewriteLocalSpecReferences(mappings: SpecPathMapping[]): Promise<number> {
  if (mappings.length === 0) return 0;
  const root = join(sugoHomeDir(), ".claude", "sugo");
  let changed = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".json") && basename(full) !== basename(markerPath())) {
        const original = await readFile(full, "utf8");
        let updated = original;
        for (const mapping of mappings) updated = updated.split(mapping.from).join(mapping.to);
        if (updated !== original) {
          const temp = `${full}.sugo-spec-migration.tmp`;
          await writeFile(temp, updated, "utf8");
          await rename(temp, full);
          changed += 1;
        }
      }
    }
  }
  await walk(root);
  return changed;
}
