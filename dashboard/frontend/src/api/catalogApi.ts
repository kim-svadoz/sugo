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
  description: string;
  kind: "skill" | "command";
  command: boolean;
}

/** 에이전트 카드는 name/description을 쓴다. 없으면 백엔드가 id를 name으로 준다. */
export interface AgentEntry {
  id: string;
  name: string;
  description: string;
}

export function listSkills(): Promise<{ skills: SkillEntry[] }> {
  return apiJson<{ skills: SkillEntry[] }>("/api/skills?locale=ko");
}
export function listAgents(): Promise<{ agents: AgentEntry[] }> {
  return apiJson<{ agents: AgentEntry[] }>("/api/skills/agents");
}
export async function getSkillContent(name: string, kind: "skill" | "command"): Promise<string> {
  const res = await apiFetch(`/api/skills/${encodeURIComponent(name)}?kind=${kind}&locale=ko`);
  if (!res.ok) throw new Error("스킬 본문을 불러오지 못했습니다.");
  return res.text();
}
export async function getHarnessUnified(): Promise<string> {
  const res = await apiFetch("/api/harness/unified");
  return res.ok ? res.text() : "";
}
export async function getHarnessManifest(): Promise<HarnessManifestEntry[]> {
  const res = await apiJson<{ harnesses: HarnessManifestEntry[] }>("/api/harness/manifest");
  return res.harnesses ?? [];
}
export async function getHarnessContent(id: string): Promise<string> {
  const res = await apiFetch(`/api/harness/content?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("하네스 본문을 불러오지 못했습니다.");
  return res.text();
}
