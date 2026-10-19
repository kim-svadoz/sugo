import type { RoadmapNode } from "./types.js";

/** 구조화된 REQ 마크다운 헤딩만 인식한다 — analyze.ts의 인라인 `REQ-N:` 매칭과는 다른,
 * 더 엄격한 계약이다. */
const REQ_HEADING_RE = /^#{1,6}[ \t]*REQ-(\d+)(?:[ \t]*(\([^\r\n)]+\)))?[ \t]*(?::|[—–])[ \t]*(.+)$/gim;

export interface ParsedRequirement {
  id: string;
  title: string;
}

export function parseRequirementsFromPrd(prdContent: string): ParsedRequirement[] {
  const results: ParsedRequirement[] = [];
  const seen = new Set<string>();
  const re = new RegExp(REQ_HEADING_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(prdContent)) !== null) {
    const id = `REQ-${m[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({ id, title: `${m[2] ? `${m[2]} ` : ""}${m[3].trim()}` });
  }
  return results;
}

export function reqConfirmId(taskId: string): string {
  return `${taskId}::REQ-CONFIRM`;
}

/** REQ 번호는 PRD 안에서만 고유하다. Roadmap/DB의 id는 workspace 범위 PK이므로 task로 namespace한다. */
export function requirementNodeId(taskId: string, requirementId: string): string {
  return `${taskId}::${requirementId}`;
}

/**
 * PRD의 REQ 헤딩을 Roadmap 자식 노드로 심는다 — 순차 선형 의존(REQ-N은 REQ-(N-1)의
 * roadmap 노드 id에 의존, PRD 등장 순서 기준이지 숫자 크기 기준이 아니다)으로 실행순서를 제안하고,
 * 항상 `{taskId}::REQ-CONFIRM`을 부착해 모든 REQ에 의존시킨다(사용자 최종확인 게이트 — 에이전트는
 * 이 노드를 완료 처리할 수 없다, tools/sugoRoadmap.ts의 mark_req 참고). REQ가 하나도 없으면
 * 심을 것이 없으므로 빈 배열(REQ-CONFIRM도 만들지 않음 — 아무 요구도 없는데 확인 게이트만 있는
 * 것은 의미가 없다).
 */
export function promotePrdRequirements(taskId: string, prdContent: string): RoadmapNode[] {
  const requirements = parseRequirementsFromPrd(prdContent);
  if (requirements.length === 0) return [];

  const nodes: RoadmapNode[] = requirements.map((req, i) => ({
    id: requirementNodeId(taskId, req.id),
    title: req.title,
    level: "subtask",
    status: "pending",
    dependsOn: i === 0 ? [] : [requirementNodeId(taskId, requirements[i - 1].id)],
    parent: taskId,
  }));

  nodes.push({
    id: reqConfirmId(taskId),
    title: "사용자 최종 확인",
    level: "step",
    status: "pending",
    dependsOn: requirements.map((r) => requirementNodeId(taskId, r.id)),
    parent: taskId,
  });

  return nodes;
}
