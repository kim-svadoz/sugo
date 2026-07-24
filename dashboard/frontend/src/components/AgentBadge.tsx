// §4: "에이전트 색: MAIN 청록, CODE 보라, TEST 에메랄드, REVIEW 앰버, DOCS 하늘."
const AGENT_COLORS: Record<string, string> = {
  MAIN: "#00b4d8",
  CODE: "#8b5cf6",
  TEST: "#10b981",
  REVIEW: "#f59e0b",
  DOCS: "#38bdf8",
};

export function AgentBadge({ agent, handoffTo }: { agent: string | null; handoffTo: string | null }) {
  if (!agent) return null;
  const color = AGENT_COLORS[agent] ?? "#94a3b8";
  return (
    <span className="font-mono text-xs" style={{ color }}>
      {agent}
      {handoffTo && (
        <>
          {" → "}
          <span style={{ color: AGENT_COLORS[handoffTo] ?? "#94a3b8" }}>{handoffTo}</span>
        </>
      )}
    </span>
  );
}
