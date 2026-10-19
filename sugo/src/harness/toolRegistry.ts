export interface HarnessDispatchRule {
  when: string;
  use: string;
}

export interface HarnessToolEntry {
  /** appliedHarnesses id에 소문자 substring으로 매칭한다. */
  match: string;
  /** 권한 allow-list용 기술 전용 MCP 네임스페이스(mcp__<server>__*). */
  mcpNamespace: string;
  /** 그 기술 전용 MCP 도구 목록. */
  loadTools: string[];
  dispatch: HarnessDispatchRule[];
}

/**
 * 하네스 도구 디스패치 레지스트리. 기본값은 빈 배열이며, 등록된 도구가 있을 때만 메뉴에 나타난다.
 */
export const HARNESS_TOOL_REGISTRY: HarnessToolEntry[] = [];

/** appliedHarnessIds 중 registry의 match 문자열을 (대소문자 무관) 포함하는 항목만 골라낸다. */
export function resolveHarnessToolGuides(
  appliedHarnessIds: string[],
  registry: HarnessToolEntry[] = HARNESS_TOOL_REGISTRY,
): HarnessToolEntry[] {
  const lowerIds = appliedHarnessIds.map((id) => id.toLowerCase());
  return registry.filter((entry) => lowerIds.some((id) => id.includes(entry.match.toLowerCase())));
}

/** 매칭된 가이드들의 mcpNamespace를 모은다(권한 allow-list에 그대로 넣을 수 있는 형태). */
export function mcpAllowPatterns(guides: HarnessToolEntry[]): string[] {
  return guides.map((g) => g.mcpNamespace);
}

/** code_start 응답/get_project_context에 실을 사람이 읽을 안내 텍스트. 가이드가 없으면 빈 문자열
 * (전용 도구가 없다는 것을 조용히 표시 — 에러도 경고도 아님). */
export function renderToolMenu(guides: HarnessToolEntry[]): string {
  if (guides.length === 0) return "";
  return guides
    .map((g) => {
      const tools = `도구: ${g.loadTools.join(", ")}`;
      const dispatch = g.dispatch.map((d) => `  - ${d.when}: ${d.use}`).join("\n");
      return `[${g.match}] ${tools}\n${dispatch}`;
    })
    .join("\n\n");
}
