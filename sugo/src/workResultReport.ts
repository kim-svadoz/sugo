import type { CompletionGrade, BypassLabel, HumanApprovalEvent } from "./labelGuard.js";
import { formatSteInspiredKorean } from "./steKorean.js";
import type { PostHocBaseline } from "./patch.js";

export interface WorkResultRequirement {
  id: string;
  covered: boolean;
}

export interface WorkResultTestEvidence {
  command?: string;
  exitCode?: number;
  total?: number;
  passed?: number;
  failed?: number;
  state: "pass" | "fail" | "unverified";
}

export interface WorkResultReport {
  bypassLabels?: BypassLabel[];
  humanApprovals?: HumanApprovalEvent[];
  schemaVersion: 1;
  presentationProfile?: "ste-inspired-ko";
  featureName: string;
  kind: "feat" | "patch";
  patchVersion: number;
  completedAt: string;
  completionGrade: CompletionGrade;
  summary: string;
  changedFiles: string[];
  requirements: WorkResultRequirement[];
  designDecisions: string[];
  knownLimitations: string[];
  seed?: string;
  provenance?: "native" | "captured-post-hoc";
  postHocCapture?: PostHocBaseline;
  verification: {
    test: WorkResultTestEvidence;
    runtimeVerified: boolean;
    wiringVerified?: boolean;
    validationVerdict?: "pass" | "partial" | "fail";
    autoVerifiedCount?: number;
    contradictionCount?: number;
  };
}

export interface BuildWorkResultReportInput {
  bypassLabels?: BypassLabel[];
  featureName: string;
  kind: "feat" | "patch";
  patchVersion: number;
  completedAt: string;
  completionGrade: CompletionGrade;
  summary: string;
  changedFiles: string[];
  requirements?: WorkResultRequirement[];
  designDecisions?: string[];
  knownLimitations?: string[];
  seed?: string;
  provenance?: "native" | "captured-post-hoc";
  postHocCapture?: PostHocBaseline;
  testEvidence: WorkResultTestEvidence;
  runtimeVerified: boolean;
  wiringVerified?: boolean;
  validation?: {
    verdict: "pass" | "partial" | "fail";
    autoVerifiedCount: number;
    contradictionCount: number;
  };
}

export function buildWorkResultReport(input: BuildWorkResultReportInput): WorkResultReport {
  return {
    schemaVersion: 1,
    presentationProfile: "ste-inspired-ko",
    bypassLabels: input.bypassLabels ? [...input.bypassLabels] : undefined,
    featureName: input.featureName,
    kind: input.kind,
    patchVersion: input.patchVersion,
    completedAt: input.completedAt,
    completionGrade: input.completionGrade,
    summary: formatSteInspiredKorean(input.summary),
    changedFiles: [...input.changedFiles],
    requirements: [...(input.requirements ?? [])],
    designDecisions: (input.designDecisions ?? []).map(formatSteInspiredKorean),
    knownLimitations: (input.knownLimitations ?? []).map(formatSteInspiredKorean),
    seed: input.seed?.trim() || undefined,
    provenance: input.provenance,
    postHocCapture: input.postHocCapture,
    verification: {
      test: { ...input.testEvidence },
      runtimeVerified: input.runtimeVerified,
      wiringVerified: input.wiringVerified,
      validationVerdict: input.validation?.verdict,
      autoVerifiedCount: input.validation?.autoVerifiedCount,
      contradictionCount: input.validation?.contradictionCount,
    },
  };
}

const yesNo = (value: boolean | undefined) => value === true ? "완료" : value === false ? "미검증" : "해당 없음";
const bullets = (items: string[], empty: string) => items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;

export function renderWorkResultMarkdown(report: WorkResultReport): string {
  const kindLabel = report.kind === "feat" ? "FEAT" : `PATCH v${report.patchVersion}`;
  const gradeLabel = report.completionGrade === "verified" ? "검증 완료" : report.completionGrade === "verified_by_human" ? "사람 승인 검증완료" : "미검증";
  const reqs = report.requirements.length > 0
    ? report.requirements.map((req) => `- [${req.covered ? "x" : " "}] ${req.id}`).join("\n")
    : "- 기록된 요구사항 커버리지 없음";
  const test = report.verification.test;
  const counts = test.total === undefined
    ? "건수 미기록"
    : `${test.passed ?? Math.max(0, test.total - (test.failed ?? 0))}/${test.total} 통과`;

  return [
    `# Work Result — ${report.featureName}`,
    "",
    `> ${kindLabel} · ${gradeLabel} · ${report.completedAt}`,
    ...(report.provenance === "captured-post-hoc" ? [
      "",
      `> Provenance: captured-post-hoc · baseline \`${report.postHocCapture?.baselineRevision ?? "미기록"}\` · ${report.postHocCapture?.source ?? "미기록"}`,
    ] : []),
    "",
    "## 결과 요약",
    "",
    report.summary,
    "",
    "## 요구사항 충족",
    "",
    reqs,
    "",
    "## 주요 변경",
    "",
    bullets(report.changedFiles.map((path) => `\`${path}\``), "변경 파일 없음"),
    "",
    "## 설계 결정",
    "",
    bullets(report.designDecisions, "별도 설계 결정 기록 없음"),
    "",
    "## 검증",
    "",
    "| 구분 | 증거 | 결과 |",
    "|---|---|---|",
    `| 테스트 | ${test.command ? `\`${test.command}\`` : "명령 미기록"} | ${test.state === "pass" ? counts : "미검증"} |`,
    `| 런타임 | 실제 실행 확인 | ${yesNo(report.verification.runtimeVerified)} |`,
    `| 배선 | 등록·호출 경로 확인 | ${yesNo(report.verification.wiringVerified)} |`,
    `| 하네스 | ${report.verification.autoVerifiedCount ?? 0}개 자동 검증 | ${report.verification.validationVerdict ?? "미기록"} |`,
    "",
    "## 남은 사항 및 위험",
    "",
    bullets(report.knownLimitations, "알려진 제한 사항 없음"),
    "",
    "## 완료등급 사유 — 우회 라벨",
    "",
    bullets((report.bypassLabels ?? []).map(l => `[${l.kind}] ${l.reason}${l.supersededAt ? ` (이전 사이클 라벨 · ${l.supersededAt} 재검증으로 해소)` : ""}`), "우회 라벨 없음"),
    "",
    "## 사람 승인",
    "",
    bullets((report.humanApprovals ?? []).map(e => `${e.action === "approve" ? "승인" : "승인 취소"} · ${e.userId} · ${e.at}\n  - 원래 라벨: [${e.kind}] ${e.originalReason}\n  - 사유: ${e.reason}\n  - 승인 당시 work-result: ${e.workResultPath}`), "사람 승인 기록 없음"),
    ...(report.seed ? ["", "## 사용자 지시", "", report.seed] : []),
    "",
  ].join("\n");
}
