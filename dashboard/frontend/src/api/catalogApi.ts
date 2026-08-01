import { apiJson, apiFetch } from "./client.js";

// §3.7 Skills/Harness(PUBLIC 카탈로그). 로컬 미설정이면 빈값. SKILLS_PATH/HARNESS_PATH로 채운다.
export interface HarnessManifestEntry {
  id?: string;
  name?: string;
  version?: string;
  [k: string]: unknown;
}

/** 설계안 — SkillList가 에이전트별로 필터링하려면 소속이 필요하다(frontmatter의 agent:). */
export interface SkillEntry {
  name: string;
  agent: string | null;
}

/** 에이전트 카드는 name/description을 쓴다. 없으면 백엔드가 id를 name으로 준다. */
export interface AgentEntry {
  id: string;
  name: string;
  description: string;
}

export function listSkills(): Promise<{ skills: SkillEntry[] }> {
  return apiJson<{ skills: SkillEntry[] }>("/api/skills");
}
export function listAgents(): Promise<{ agents: AgentEntry[] }> {
  return apiJson<{ agents: AgentEntry[] }>("/api/skills/agents");
}
export async function getHarnessUnified(): Promise<string> {
  const res = await apiFetch("/api/harness/unified");
  return res.ok ? res.text() : "";
}
export async function getHarnessManifest(): Promise<HarnessManifestEntry[]> {
  const res = await apiJson<{ harnesses: HarnessManifestEntry[] }>("/api/harness/manifest");
  return res.harnesses ?? [];
}
