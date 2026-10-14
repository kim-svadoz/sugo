import { AGENT_COLOR_HEX } from "../lib/colorSystem.js";

export function AgentBadge({ agent, handoffTo }: { agent: string | null; handoffTo: string | null }) {
  if (!agent) return null;
  const color = AGENT_COLOR_HEX[agent] ?? "#94a3b8";
  return (
    <span className="font-mono text-xs" style={{ color }}>
      {agent}
      {handoffTo && (
        <>
          {" → "}
          <span style={{ color: AGENT_COLOR_HEX[handoffTo] ?? "#94a3b8" }}>{handoffTo}</span>
        </>
      )}
    </span>
  );
}
