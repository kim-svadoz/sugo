import { useEffect, useMemo, useState } from "react";
import { listAgents, listSkills } from "../api/catalogApi.js";

// §5 Skills — 에이전트 카드 + 스킬 목록 + 검색 필터. 데이터는 백엔드 /api/skills(SKILLS_PATH).
export function Skills() {
  const [agents, setAgents] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
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

  const filtered = useMemo(() => skills.filter((s) => s.toLowerCase().includes(q.toLowerCase())), [skills, q]);
  const empty = loaded && agents.length === 0 && skills.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-bold ck-text-glow" style={{ color: "var(--color-primary)" }}>Skills</h1>
        <span className="ck-pill text-slate-400">{agents.length} agents · {skills.length} skills</span>
        <input className="ck-input ml-auto w-56" placeholder="스킬 검색…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {empty ? (
        <div className="ck-glass ck-card ck-scan space-y-2 text-sm text-slate-300">
          <div className="font-mono text-slate-100">카탈로그가 비어 있습니다.</div>
          <p className="text-slate-400">
            백엔드 <code style={{ color: "var(--color-primary)" }}>SKILLS_PATH</code>를 플러그인의 <code>sugo/skills</code>(또는 에이전트 프롬프트 디렉터리)로 지정하면
            여기에 에이전트/스킬 카드가 채워집니다. (로컬 dev면 backend/.env에 <code>SKILLS_PATH=...</code>)
          </p>
        </div>
      ) : (
        <>
          {agents.length > 0 && (
            <div>
              <div className="mb-2 text-[0.68rem] font-mono uppercase text-slate-500">Agents</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {agents.map((a) => (
                  <div key={a} className="ck-glass ck-card ck-line-in flex items-center gap-2 py-3 hover:ck-glow-cyan">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs neon-border-cyan" style={{ color: "#7de3ff" }}>{a[0]?.toUpperCase()}</span>
                    <span className="font-mono text-sm">{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {skills.length > 0 && (
            <div>
              <div className="mb-2 text-[0.68rem] font-mono uppercase text-slate-500">Skills</div>
              <div className="flex flex-wrap gap-2">
                {filtered.map((s) => (
                  <span key={s} className="ck-pill ck-line-in" style={{ color: "#c4b5fd", borderColor: "rgba(139,92,246,0.4)" }}>{s}</span>
                ))}
                {filtered.length === 0 && <span className="text-sm text-slate-500">검색 결과 없음</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
