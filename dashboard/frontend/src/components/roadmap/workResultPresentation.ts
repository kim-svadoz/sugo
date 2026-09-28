import type { WorkResult, WorkResultReport } from "../../hooks/useRoadmap.js";

export interface WorkResultSection {
  title: string;
  items: string[];
  tone: "neutral" | "warning";
}

export interface WorkResultPresentation {
  summary: string;
  versionLabel: string;
  gradeLabel: string;
  grade: "verified" | "unverified" | "legacy";
  testLabel: string | null;
  testCommand: string | null;
  runtimeVerified?: boolean;
  wiringVerified?: boolean;
  sections: WorkResultSection[];
}

function isWorkResultReport(
  value: Pick<WorkResult, "summary" | "patchVersion" | "runtimeVerified" | "wiringVerified"> | WorkResultReport,
): value is WorkResultReport {
  return "schemaVersion" in value && value.schemaVersion === 1;
}

export function workResultPresentation(value: Pick<WorkResult, "summary" | "patchVersion" | "runtimeVerified" | "wiringVerified"> | WorkResultReport): WorkResultPresentation {
  if (!isWorkResultReport(value)) {
    return {
      summary: value.summary ?? "기록된 작업 요약이 없습니다.",
      versionLabel: value.patchVersion && value.patchVersion > 0 ? `v${value.patchVersion} patch` : "작업 결과",
      gradeLabel: "레거시 기록",
      grade: "legacy",
      testLabel: null,
      testCommand: null,
      runtimeVerified: value.runtimeVerified,
      wiringVerified: value.wiringVerified,
      sections: [],
    };
  }

  const report = value;
  const test = report.verification.test;
  const passed = test.passed ?? (test.total !== undefined ? Math.max(0, test.total - (test.failed ?? 0)) : undefined);
  const testLabel = test.state === "pass"
    ? test.total !== undefined ? `${passed}/${test.total} 통과` : "통과"
    : test.state === "fail" ? "실패" : "미검증";
  const sections: WorkResultSection[] = [];
  if (report.requirements?.length) {
    sections.push({ title: "요구사항", items: report.requirements.map((item) => `${item.covered ? "✓" : "○"} ${item.id}`), tone: "neutral" });
  }
  sections.push({ title: "주요 변경", items: report.changedFiles.length ? report.changedFiles : ["변경 파일 없음"], tone: "neutral" });
  sections.push({ title: "설계 결정", items: report.designDecisions.length ? report.designDecisions : ["별도 설계 결정 기록 없음"], tone: "neutral" });
  sections.push({ title: "남은 사항 및 위험", items: report.knownLimitations.length ? report.knownLimitations : ["알려진 제한 사항 없음"], tone: report.knownLimitations.length ? "warning" : "neutral" });

  return {
    summary: report.summary,
    versionLabel: report.kind === "patch" ? `v${report.patchVersion} patch` : "v0 feat",
    gradeLabel: report.completionGrade === "verified" ? "검증 완료" : "미검증",
    grade: report.completionGrade,
    testLabel,
    testCommand: test.command ?? null,
    runtimeVerified: report.verification.runtimeVerified,
    wiringVerified: report.verification.wiringVerified,
    sections,
  };
}
