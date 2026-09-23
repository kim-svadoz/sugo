import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("patch lineage visual", () => {
  const source = readFileSync(new URL("./RoadmapGraph.tsx", import.meta.url), "utf8");
  const lineage = source.slice(source.indexOf("function LineageChainNode"), source.indexOf("const nodeTypes"));

  it("v0 위에는 stem을 그리지 않고 버전 카드 사이에만 점선을 그린다", () => {
    expect(lineage).not.toContain('position={Position.Top} id="top"');
    expect(lineage).not.toContain("<svg");
    expect(lineage).toContain("ri > 0");
  });

  it("v0는 상태 카드로 유지하고 v1+ patch만 보라색 계보 카드로 표시한다", () => {
    expect(lineage).toContain("const isFeat = item.version === 0");
    expect(lineage).toContain('isFeat ? "bg-[var(--color-surface)]" : "bg-violet-500/10 px-2.5 py-2"');
    expect(lineage).toContain("bg-violet-500/10");
    expect(lineage).toContain("text-violet-100");
    expect(lineage).toContain("font-mono text-[12px] font-bold");
  });
});
