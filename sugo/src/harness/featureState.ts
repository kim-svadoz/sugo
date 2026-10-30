import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { sugoHomeDir } from "../homeDir.js";

export interface HarnessFeatureState { enabled: boolean }

export function harnessFeatureStatePath(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "harness-feature.json");
}

export async function loadHarnessFeatureState(): Promise<HarnessFeatureState> {
  try {
    const value = JSON.parse(await readFile(harnessFeatureStatePath(), "utf8")) as Partial<HarnessFeatureState>;
    return { enabled: value.enabled !== false };
  } catch {
    return { enabled: true };
  }
}

export async function saveHarnessFeatureState(state: HarnessFeatureState): Promise<void> {
  const path = harnessFeatureStatePath();
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, `${JSON.stringify(state, null, 2)}\n`);
}
