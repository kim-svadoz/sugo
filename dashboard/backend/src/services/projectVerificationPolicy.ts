import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface ProjectConfigDocument {
  verificationPolicy?: { integrationGateEnforced?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

const configPath = (projectPath: string) => join(projectPath, "sugo", "config.json");

async function readConfig(projectPath: string): Promise<ProjectConfigDocument> {
  return JSON.parse(await readFile(configPath(projectPath), "utf8")) as ProjectConfigDocument;
}

export async function readProjectVerificationPolicy(projectPath: string) {
  const config = await readConfig(projectPath);
  return { integrationGateEnforced: config.verificationPolicy?.integrationGateEnforced === true };
}

export async function writeProjectVerificationPolicy(projectPath: string, integrationGateEnforced: boolean): Promise<{ integrationGateEnforced: boolean }> {
  const path = configPath(projectPath);
  const config = await readConfig(projectPath);
  const updated = {
    ...config,
    verificationPolicy: { ...config.verificationPolicy, integrationGateEnforced },
  };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`);
  await rename(temporary, path);
  return { integrationGateEnforced };
}
