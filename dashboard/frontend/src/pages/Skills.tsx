import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { BookOpen, Code2, FileText, GitPullRequest, Search, TestTube2, TerminalSquare, Workflow, type LucideIcon } from "lucide-react";
import { getSkillContent, listAgents, listSkills, type AgentEntry, type SkillEntry } from "../api/catalogApi.js";
import { Modal } from "../components/Modal.js";
import { AGENT_TONES, FALLBACK_AGENT_TONE } from "../lib/colorSystem.js";
import { cn } from "../lib/utils.js";
import { PageHeading } from "../components/PageHeading.js";

const agentIcons: Record<string, LucideIcon> = { code: Code2, test: TestTube2, docs: FileText, review: GitPullRequest, sugo: Workflow };
const agentLabels: Record<string, string> = { code: "구현 에이전트", test: "테스트 에이전트", review: "검토 에이전트", docs: "문서 에이전트", sugo: "공용" };
const agentContexts: Record<string, string> = {
  code: "코드를 구현하거나 수정하는 단계에서 적용합니다.",
  test: "동작을 검증하고 회귀 테스트를 작성하는 단계에서 적용합니다.",
  review: "구현 결과와 증거를 검토하는 단계에서 적용합니다.",
  docs: "완료된 변경을 문서화하는 단계에서 적용합니다.",
};
type CatalogView = "skills" | "commands";

function accentKey(id: string): string {
  const base = id.replace(/-agent$/, "").toLowerCase();
  return base in AGENT_TONES ? base : "sugo";
}

function visibleMarkdown(source: string): string {
  return source.replace(/^---[\s\S]*?---\s*/, "");
}

function agentDisplayLabel(id?: string | null): string {
  if (!id) return "모든 에이전트";
  const key = accentKey(id);
  return agentLabels[key] ?? `${id.replace(/-agent$/, "")} 에이전트`;
}

function agentSkillContext(id: string): string {
  if (id === "all") return "공용 스킬과 역할별 에이전트 전용 스킬을 함께 봅니다.";
  if (id === "common") return "모든 에이전트가 작업 전반에서 함께 적용하는 스킬입니다.";
  const key = accentKey(id);
  return `${agentDisplayLabel(id)}가 ${agentContexts[key] ?? "담당 작업 단계에서 적용합니다."}`;
}

export function Skills() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [catalogView, setCatalogView] = useState<CatalogView>("skills");
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    Promise.all([listAgents().catch(() => ({ agents: [] })), listSkills().catch(() => ({ skills: [] }))])
      .then(([agentResult, skillResult]) => { setAgents(agentResult.agents ?? []); setSkills(skillResult.skills ?? []); })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!selectedSkill) return setDetail("");
    let cancelled = false;
    getSkillContent(selectedSkill.name, catalogView === "commands" ? "command" : "skill").then(value => !cancelled && setDetail(value)).catch(() => !cancelled && setDetail(""));
    return () => { cancelled = true; };
  }, [selectedSkill, catalogView]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return skills.filter(skill => {
      const byView = catalogView === "commands" ? skill.kind === "command" || skill.command : skill.kind === "skill";
      const byAgent = catalogView === "commands" || selectedAgent === "all" || (selectedAgent === "common" ? !skill.agent : skill.agent === selectedAgent);
      const text = `${skill.name} ${skill.description} ${skill.agent ?? ""}`.toLowerCase();
      return byView && byAgent && (!needle || text.includes(needle));
    });
  }, [skills, selectedAgent, catalogView, q]);

  const selectedAgentMeta = agents.find(agent => agent.id === selectedAgent);
  const html = useMemo(() => detail ? marked.parse(visibleMarkdown(detail), { async: false }) as string : "", [detail]);
  const empty = loaded && agents.length === 0 && skills.length === 0;
  const skillCount = skills.filter(skill => skill.kind === "skill").length;
  const commandCount = skills.filter(skill => skill.kind === "command" || skill.command).length;
  const commonCount = skills.filter(skill => skill.kind === "skill" && !skill.agent).length;

  return <div className="space-y-5">
    <PageHeading eyebrow="AI CAPABILITIES" title="스킬 카탈로그" description={catalogView === "skills" ? "AI가 작업 중 적용하는 전문 규칙과 역할을 확인합니다." : "사용자가 직접 시작할 수 있는 명령을 확인합니다."} action={<span className="font-mono text-xs text-[var(--color-text-dim)]">{skillCount} skills · {commandCount} commands</span>} />

    {!empty && <section aria-label="카탈로그 종류" className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
        <button onClick={() => setCatalogView("skills")} aria-pressed={catalogView === "skills"} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors", catalogView === "skills" ? "bg-cyan-400/15 text-cyan-200" : "text-[var(--color-text-muted)] hover:text-white")}><BookOpen size={13} /> 스킬 <span className="font-mono text-[9px] opacity-65">{skillCount}</span></button>
        <button onClick={() => setCatalogView("commands")} aria-pressed={catalogView === "commands"} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors", catalogView === "commands" ? "bg-violet-400/15 text-violet-200" : "text-[var(--color-text-muted)] hover:text-white")}><TerminalSquare size={13} /> Command <span className="font-mono text-[9px] opacity-65">{commandCount}</span></button>
      </div>
      <p className="text-[12px] text-[var(--color-text-muted)]">{catalogView === "skills" ? "스킬은 AI가 작업 중 적용하는 규칙입니다." : "Command는 사용자가 직접 시작하는 명령입니다."}</p>
    </section>}

    {!empty && catalogView === "skills" && <section aria-label="스킬 담당 필터">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-dim)]">이 스킬을 적용하는 주체</div>
      <div className="flex flex-wrap items-center gap-1">
        <button onClick={() => setSelectedAgent("all")} aria-pressed={selectedAgent === "all"} className={cn("rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors", selectedAgent === "all" ? "bg-[var(--color-action-primary)] text-slate-950" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]")}>전체 스킬 <span className="ml-1 font-mono text-[9px] opacity-70">{skillCount}</span></button>
        <button onClick={() => setSelectedAgent("common")} aria-pressed={selectedAgent === "common"} className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors", selectedAgent === "common" ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]")}><Workflow size={13} /> 모든 에이전트 <span className="font-mono text-[9px] opacity-60">{commonCount}</span></button>
        {agents.map(agent => {
          const key = accentKey(agent.id), tone = AGENT_TONES[key] ?? FALLBACK_AGENT_TONE, Icon = agentIcons[key] ?? Workflow;
          const count = skills.filter(skill => skill.kind === "skill" && skill.agent === agent.id).length;
          const active = selectedAgent === agent.id;
          return <button key={agent.id} onClick={() => setSelectedAgent(active ? "all" : agent.id)} aria-pressed={active} className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-all", active ? cn("border-transparent bg-[var(--color-surface-hover)] ring-1", tone.ring, tone.icon) : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]")}><Icon size={13} /><span>{agentDisplayLabel(agent.id)}</span><span className="font-mono text-[9px] opacity-60">{count}</span></button>;
        })}
      </div>
      <p className="mt-2 max-w-4xl text-[11px] leading-5 text-[var(--color-text-muted)]">{agentSkillContext(selectedAgent)}{selectedAgentMeta?.description ? ` ${selectedAgentMeta.description}` : ""}</p>
    </section>}

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[260px] max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" size={16} />
        <input value={q} onChange={event => setQ(event.target.value)} aria-label={catalogView === "skills" ? "스킬 검색" : "Command 검색"} placeholder="이름, 역할, 설명 검색" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10" />
      </div>
    </div>

    {empty ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">플러그인 경로가 연결되면 설치된 스킬이 여기에 표시됩니다.</div>
      : filtered.length === 0 ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">조건에 맞는 스킬이 없습니다.</div>
      : <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/35">
        {filtered.map(skill => {
          const tone = AGENT_TONES[accentKey(skill.agent ?? "")] ?? FALLBACK_AGENT_TONE;
          return <button key={`${skill.kind}:${skill.name}`} onClick={() => setSelectedSkill(skill)} className="group grid w-full grid-cols-[minmax(170px,0.7fr)_minmax(260px,1.5fr)_auto] items-center gap-5 px-2 py-3 text-left transition-colors hover:bg-[var(--color-surface-hover)] max-md:grid-cols-1 max-md:gap-1.5">
            <span className="flex items-center gap-2 font-mono text-[13px] font-semibold text-[var(--color-text-bright)]">{catalogView === "commands" ? <TerminalSquare size={15} /> : <BookOpen size={15} />} {skill.name}</span>
            <span className="line-clamp-2 text-[12.5px] leading-5 text-[var(--color-text-muted)]">{skill.description || "설명이 등록되지 않았습니다."}</span>
            <span className="flex justify-end gap-1.5 max-md:justify-start">{catalogView === "commands" ? <span className="rounded border border-violet-400/20 bg-violet-400/[0.06] px-2 py-0.5 font-mono text-[10px] text-violet-300">command</span> : <span className={cn("rounded border px-2 py-0.5 text-[10px]", skill.agent ? cn(tone.chip, tone.icon) : "border-cyan-400/20 bg-cyan-400/[0.05] text-cyan-200")}>{agentDisplayLabel(skill.agent)}</span>}</span>
          </button>;
        })}
      </div>}

    {selectedSkill && <Modal onClose={() => setSelectedSkill(null)} size="wide"><div className="mb-5 flex flex-wrap items-center gap-2"><h2 className="mr-auto font-mono text-xl font-bold text-[var(--color-text-bright)]">{selectedSkill.name}</h2>{catalogView === "commands" ? <span className="rounded border border-violet-400/25 px-2 py-1 font-mono text-[10px] text-violet-300">command</span> : <span className="rounded border border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text-muted)]">{agentDisplayLabel(selectedSkill.agent)}</span>}</div>{html ? <article className="md-body" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">본문을 불러오지 못했습니다.</p>}</Modal>}
  </div>;
}
