import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { BookOpen, Code2, FileText, GitPullRequest, Search, TestTube2, TerminalSquare, Workflow, type LucideIcon } from "lucide-react";
import { getSkillContent, listAgents, listSkills, type AgentEntry, type SkillEntry } from "../api/catalogApi.js";
import { Modal } from "../components/Modal.js";
import { AGENT_TONES, FALLBACK_AGENT_TONE } from "../lib/colorSystem.js";
import { cn } from "../lib/utils.js";

const agentIcons: Record<string, LucideIcon> = { code: Code2, test: TestTube2, docs: FileText, review: GitPullRequest, sugo: Workflow };

function accentKey(id: string): string {
  const base = id.replace(/-agent$/, "").toLowerCase();
  return base in AGENT_TONES ? base : "sugo";
}

function visibleMarkdown(source: string): string {
  return source.replace(/^---[\s\S]*?---\s*/, "");
}

export function Skills() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("all");
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
    getSkillContent(selectedSkill.name).then(value => !cancelled && setDetail(value)).catch(() => !cancelled && setDetail(""));
    return () => { cancelled = true; };
  }, [selectedSkill]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return skills.filter(skill => {
      const byAgent = selectedAgent === "all" || accentKey(skill.agent ?? "") === accentKey(selectedAgent);
      const text = `${skill.name} ${skill.description} ${skill.agent ?? ""}`.toLowerCase();
      return byAgent && (!needle || text.includes(needle));
    });
  }, [skills, selectedAgent, q]);

  const selectedAgentMeta = agents.find(agent => agent.id === selectedAgent);
  const html = useMemo(() => detail ? marked.parse(visibleMarkdown(detail), { async: false }) as string : "", [detail]);
  const empty = loaded && agents.length === 0 && skills.length === 0;

  return <div className="space-y-5">
    <header className="flex items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-[var(--color-text-bright)]">Skills</h1><p className="mt-1 text-sm text-[var(--color-text-muted)]">에이전트가 실제 작업에서 사용하는 실행 규칙</p></div>
      <span className="font-mono text-xs text-[var(--color-text-dim)]">{skills.length} installed</span>
    </header>

    {!empty && <section aria-label="에이전트 필터" className="border-y border-[var(--color-border)] py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setSelectedAgent("all")} aria-pressed={selectedAgent === "all"} className={cn("rounded-lg px-3 py-2 text-sm font-semibold transition-colors", selectedAgent === "all" ? "bg-[var(--color-action-primary)] text-slate-950" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]")}>전체 <span className="ml-1 font-mono text-[10px] opacity-70">{skills.length}</span></button>
        {agents.map(agent => {
          const key = accentKey(agent.id), tone = AGENT_TONES[key] ?? FALLBACK_AGENT_TONE, Icon = agentIcons[key] ?? Workflow;
          const count = skills.filter(skill => accentKey(skill.agent ?? "") === key).length;
          const active = selectedAgent === agent.id;
          return <button key={agent.id} onClick={() => setSelectedAgent(active ? "all" : agent.id)} aria-pressed={active} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all", active ? cn("border-transparent bg-[var(--color-surface-hover)] ring-1", tone.ring, tone.icon) : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]")}><Icon size={15} /><span>{agent.name.replace(/-agent$/, "")}</span><span className="font-mono text-[10px] opacity-60">{count}</span></button>;
        })}
      </div>
      {selectedAgentMeta?.description && <p className="mt-3 max-w-4xl text-xs leading-5 text-[var(--color-text-muted)]">{selectedAgentMeta.description}</p>}
    </section>}

    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" size={16} />
      <input value={q} onChange={event => setQ(event.target.value)} aria-label="스킬 검색" placeholder="이름, 역할, 설명 검색" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10" />
    </div>

    {empty ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">플러그인 경로가 연결되면 설치된 스킬이 여기에 표시됩니다.</div>
      : filtered.length === 0 ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">조건에 맞는 스킬이 없습니다.</div>
      : <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {filtered.map(skill => {
          const tone = AGENT_TONES[accentKey(skill.agent ?? "")] ?? FALLBACK_AGENT_TONE;
          return <button key={skill.name} onClick={() => setSelectedSkill(skill)} className="group grid w-full grid-cols-[minmax(170px,0.7fr)_minmax(260px,1.5fr)_auto] items-center gap-5 px-2 py-3 text-left transition-colors hover:bg-[var(--color-surface-hover)] max-md:grid-cols-1 max-md:gap-1.5">
            <span className="flex items-center gap-2 font-mono text-[13px] font-semibold text-[var(--color-text-bright)]">{skill.kind === "command" ? <TerminalSquare size={15} /> : <BookOpen size={15} />} {skill.name}</span>
            <span className="line-clamp-2 text-[12.5px] leading-5 text-[var(--color-text-muted)]">{skill.description || "설명이 등록되지 않았습니다."}</span>
            <span className="flex justify-end gap-1.5 max-md:justify-start">{skill.command && <span className="rounded border border-violet-400/20 bg-violet-400/[0.06] px-2 py-0.5 font-mono text-[10px] text-violet-300">command</span>}{skill.agent && <span className={cn("rounded border px-2 py-0.5 font-mono text-[10px]", tone.chip, tone.icon)}>{skill.agent}</span>}</span>
          </button>;
        })}
      </div>}

    {selectedSkill && <Modal onClose={() => setSelectedSkill(null)} size="wide"><div className="mb-5 flex flex-wrap items-center gap-2"><h2 className="mr-auto font-mono text-xl font-bold text-[var(--color-text-bright)]">{selectedSkill.name}</h2>{selectedSkill.command && <span className="rounded border border-violet-400/25 px-2 py-1 font-mono text-[10px] text-violet-300">command</span>}{selectedSkill.agent && <span className="rounded border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-muted)]">{selectedSkill.agent}</span>}</div>{html ? <article className="md-body" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">본문을 불러오지 못했습니다.</p>}</Modal>}
  </div>;
}
