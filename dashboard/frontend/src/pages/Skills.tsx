import { useEffect, useMemo, useState } from "react";
import { Code2, FileText, GitPullRequest, TestTube2, Workflow, type LucideIcon } from "lucide-react";
import { listAgents, listSkills, type AgentEntry, type SkillEntry } from "../api/catalogApi.js";
import { AGENT_TONES, FALLBACK_AGENT_TONE } from "../lib/colorSystem.js";
import { cn } from "../lib/utils.js";

const agentIcons: Record<string, LucideIcon> = {
  code: Code2,
  test: TestTube2,
  docs: FileText,
  review: GitPullRequest,
  sugo: Workflow,
};

const AGENT_FILTERS = [
  ["all", "All"],
  ["code", "Code"],
  ["test", "Test"],
  ["docs", "Docs"],
  ["review", "Review"],
  ["sugo", "Sugo"],
] as const;

/** 에이전트 id는 파일명이 `code-agent`처럼 접미사를 달고 오기도 한다 — 액센트 키로 정규화. */
function accentKey(id: string): string {
  const base = id.replace(/-agent$/, "").toLowerCase();
  return base in AGENT_TONES ? base : "sugo";
}

export function Skills() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([listAgents().catch(() => ({ agents: [] })), listSkills().catch(() => ({ skills: [] }))])
      .then(([a, s]) => {
        setAgents(a.agents ?? []);
        setSkills(s.skills ?? []);
      })
      .finally(() => setLoaded(true));
  }, []);

  // 같은 카드를 다시 누르면 'all'로 토글(설계안 handleAgentClick).
  const handleAgentClick = (id: string) => setSelectedAgent((cur) => (cur === id ? "all" : id));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return skills.filter((s) => {
      const byAgent = selectedAgent === "all" || accentKey(s.agent ?? "") === accentKey(selectedAgent);
      const byText = !needle || s.name.toLowerCase().includes(needle);
      return byAgent && byText;
    });
  }, [skills, selectedAgent, q]);

  const empty = loaded && agents.length === 0 && skills.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        {agents.map((agent) => {
          const key = accentKey(agent.id);
          const Icon = agentIcons[key] ?? Workflow;
          const a = AGENT_TONES[key] ?? FALLBACK_AGENT_TONE;
          const agentSkills = skills.filter((s) => accentKey(s.agent ?? "") === key);
          const isSelected = selectedAgent === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => handleAgentClick(agent.id)}
              aria-pressed={isSelected}
              className={cn(
                "ck-card relative overflow-hidden rounded-xl border bg-[var(--color-surface)] p-4 text-left",
                isSelected ? "border-transparent ring-1 ring-[var(--color-action-primary)]/60" : "border-[var(--color-border)]",
              )}
            >
              <span className={cn("absolute inset-x-0 top-0 h-0.5", a.bar, isSelected ? "opacity-100" : "opacity-30")} />
              <div className="flex items-center justify-between">
                <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg border", a.chip)}>
                  <Icon className={cn("h-5 w-5", a.icon)} />
                </span>
                <span className="font-mono text-2xl font-bold text-[var(--color-text-bright)]">{agentSkills.length}</span>
              </div>
              <h3 className="mt-3 text-[15px] font-semibold text-[var(--color-text)]">{agent.name}</h3>
              <p className="mt-1 line-clamp-2 text-[12.5px] text-[var(--color-text-muted)]">{agent.description}</p>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isSelected ? cn(a.bar, "ck-pulse-dot") : "bg-[var(--color-text-dim)]",
                  )}
                />
                <span className={isSelected ? a.icon : "text-[var(--color-text-dim)]"}>
                  {isSelected ? "SELECTED" : "idle"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[12px] text-[var(--color-text-dim)]">
        카드를 눌러 해당 에이전트의 스킬을 필터링합니다. 실제 구동은 Claude Code(CLI) 또는 로드맵 노드에서 실행됩니다.
      </p>

      <div className="mt-2">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-bright)]">
          {selectedAgent === "all"
            ? "All Skills"
            : `${selectedAgent.charAt(0).toUpperCase() + selectedAgent.slice(1)} Skills`}
        </h2>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {AGENT_FILTERS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSelectedAgent(id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                selectedAgent === id
                  ? "bg-[var(--color-action-primary)] text-slate-950"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]",
              )}
            >
              {label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search skills..."
            className="ml-auto w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
          />
        </div>

        {empty ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[13px] text-[var(--color-text-muted)]">
            SKILLS_PATH가 설정되지 않았습니다 — 백엔드 환경변수에 플러그인 경로를 지정하면 목록이 채워집니다.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[13px] text-[var(--color-text-muted)]">
            No skills found
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => {
              const a = AGENT_TONES[accentKey(s.agent ?? "")] ?? FALLBACK_AGENT_TONE;
              return (
                <div
                  key={s.name}
                  className="ck-card rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13.5px] font-semibold text-[var(--color-text)]">{s.name}</span>
                    {s.agent && (
                      <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", a.chip, a.icon)}>
                        {s.agent}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
