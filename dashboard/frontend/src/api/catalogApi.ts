import { apiJson, apiFetch } from "./client.js";

// §3.7 Skills/Harness(PUBLIC 카탈로그). 로컬 미설정이면 빈값. SKILLS_PATH/HARNESS_PATH로 채운다.
export interface HarnessManifestEntry {
  id?: string;
  name?: string;
  version?: string;
  [k: string]: unknown;
}

export function listSkills(): Promise<{ skills: string[] }> {
  return apiJson<{ skills: string[] }>("/api/skills");
}
export function listAgents(): Promise<{ agents: string[] }> {
  return apiJson<{ agents: string[] }>("/api/skills/agents");
}
export async function getHarnessUnified(): Promise<string> {
  const res = await apiFetch("/api/harness/unified");
  return res.ok ? res.text() : "";
}
export async function getHarnessManifest(): Promise<HarnessManifestEntry[]> {
  const res = await apiJson<{ harnesses: HarnessManifestEntry[] }>("/api/harness/manifest");
  return res.harnesses ?? [];
}
