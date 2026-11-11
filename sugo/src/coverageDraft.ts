import type { ContractTestRecord } from "./contractEvidence.js";

export interface CoverageDraftCriterion {
  id: string;
  evidence: string[];
}

export interface CoverageMapDraft {
  acceptanceCriteria: CoverageDraftCriterion[];
  responseFields: Array<{ field: string; evidence: string[] }>;
  integrationTestCount: number;
  regressionChecked: boolean;
  regressionIntact: boolean;
}

function completionSection(prd: string): string {
  const lines = prd.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s*완료조건\s*$/.test(line.trim()));
  if (start < 0) return "";
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s/.test(line.trim()));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join("\n");
}

function requirementIds(value: string): string[] {
  return [...new Set([...value.matchAll(/\bREQ-\d+\b/gi)].map((match) => match[0].toUpperCase()))];
}

export function buildCoverageMapDraft(input: {
  prd: string;
  contracts?: ContractTestRecord[];
  testClasses?: string[];
}): CoverageMapDraft {
  const section = completionSection(input.prd);
  const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const criteria = new Map<string, string[]>();

  for (const line of lines) {
    const ids = requirementIds(line);
    const description = line.replace(/^[-*]\s*/, "").replace(/\s*\(REQ-\d+\)\s*/gi, " ").trim();
    for (const id of ids) criteria.set(id, [`완료조건: ${description}`]);
  }

  for (const contract of input.contracts ?? []) {
    if (contract.greenExitCode !== 0) continue;
    for (const id of requirementIds(contract.contractId)) {
      if (criteria.has(id)) criteria.get(id)!.push(`계약 테스트: ${contract.contractId}`);
    }
  }

  for (const testClass of input.testClasses ?? []) {
    for (const id of requirementIds(testClass)) {
      if (criteria.has(id)) criteria.get(id)!.push(`테스트 클래스: ${testClass}`);
    }
  }

  return {
    acceptanceCriteria: [...criteria].map(([id, evidence]) => ({ id, evidence })),
    responseFields: [],
    integrationTestCount: input.testClasses?.length ?? 0,
    regressionChecked: false,
    regressionIntact: false,
  };
}
