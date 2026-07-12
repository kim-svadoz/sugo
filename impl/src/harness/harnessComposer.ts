import type { DetectedItem, DetectedStack, HarnessContent } from "./types.js";

export interface HarnessFile {
  relPath: string;
  content: string;
}

export interface ComposeResult {
  claudeMd: string;
  harnessFiles: HarnessFile[];
  appliedHarnesses: { id: string; version: string }[];
  warnings: string[];
}

export interface ComposeParams {
  harnesses: HarnessContent[];
  projectName: string;
  workspace?: string;
  detectedStack: DetectedStack;
  fetchWarnings: string[];
}

function extractCoreRuleBullets(harnessMd: string, limit = 2): string[] {
  const lines = harnessMd.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => /^#{1,3}\s*핵심 규칙/.test(l.trim()));
  if (headingIdx === -1) return [];
  const bullets: string[] = [];
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,3}\s/.test(line)) break; // 다음 섹션
    const m = line.match(/^(?:\d+\.|-)\s+(.*)$/);
    if (m) bullets.push(m[1]);
    if (bullets.length >= limit) break;
  }
  return bullets;
}

function formatItemList(items: DetectedItem[]): string {
  if (items.length === 0) return "(없음)";
  return items.map((i) => (i.version ? `${i.name} ${i.version}` : i.name)).join(", ");
}

function formatCommands(commands: DetectedStack["commands"]): string {
  const entries = Object.entries(commands).filter(([, v]) => v);
  if (entries.length === 0) return "(감지된 명령 없음)";
  return entries.map(([k, v]) => `${k}=\`${v}\``).join(", ");
}

/**
 * 순수 함수: 적용된 하네스 목록 + 감지된 스택 → sugo/CLAUDE.md 인덱스 + 개별 하네스 파일 목록.
 * 파일 IO는 호출부(tools/sugoAdd.ts)의 책임.
 */
export function compose(params: ComposeParams): ComposeResult {
  const { harnesses, projectName, workspace, detectedStack, fetchWarnings } = params;

  const harnessFiles: HarnessFile[] = [];
  for (const h of harnesses) {
    harnessFiles.push({ relPath: `sugo/harness/${h.id}/harness.md`, content: h.harnessMd });
    harnessFiles.push({ relPath: `sugo/harness/${h.id}/validation.yaml`, content: h.validationYaml });
  }

  const appliedTableRows = harnesses
    .map((h) => `| \`${h.id}\` | ${h.source === "default-fallback" ? "(폴백) " : ""}${h.version} |`)
    .join("\n");

  const ruleSummaryBlocks = harnesses
    .map((h) => {
      const bullets = extractCoreRuleBullets(h.harnessMd);
      if (bullets.length === 0) return `### \`${h.id}\`\n(핵심 규칙 섹션 없음 — harness.md 참고)`;
      return `### \`${h.id}\`\n${bullets.map((b) => `- ${b}`).join("\n")}`;
    })
    .join("\n\n");

  const allWarnings = [...fetchWarnings];

  const claudeMd = `# ${projectName} — Sugo 하네스 인덱스

> 자동 생성됨. \`sugo:add\`를 다시 실행하면 갱신됩니다. 개별 하네스 전문은
> \`sugo/harness/<id>/harness.md\`, 검증 설정은 \`sugo/harness/<id>/validation.yaml\`을 참고하세요.
${workspace ? `>\n> 워크스페이스: \`${workspace}\`` : ""}

## 감지된 스택

- **언어:** ${formatItemList(detectedStack.languages)}
- **프레임워크:** ${formatItemList(detectedStack.frameworks)}
- **빌드도구:** ${formatItemList(detectedStack.buildTools)}
- **데이터스토어(정보성 — 별도 하네스 미적용):** ${formatItemList(detectedStack.dataStores)}
- **인프라(정보성):** ${formatItemList(detectedStack.infra)}
- **감지된 명령:** ${formatCommands(detectedStack.commands)}

## 적용된 하네스

| id | version |
|----|---------|
${appliedTableRows}

## 핵심 규칙 요약

${ruleSummaryBlocks}

## 검증 게이트 섹션

이 인덱스는 하네스 콘텐츠만 합성한 것이며, sugo 파이프라인의 강제 게이트(analyze 호출강제,
baseline, wiring/glue/boot, 테스트증거대조, review 3중검증 등)는 별도 구현 단계입니다.
현재 빌드에서는 \`sugo_plan\` 상태머신의 순서강제(Gate Keeper)만 동작하며, 위 표의 각 하네스
\`validation.yaml\`에 정의된 개별 검증 규칙은 \`sugo_validate\`(review 단계) 구현 이후 실제로
집행됩니다. 그 전까지는 위 "핵심 규칙 요약"을 코드 작성 시 참고 자료로만 활용하세요.

${allWarnings.length > 0 ? `## 경고\n\n${allWarnings.map((w) => `- ${w}`).join("\n")}\n` : ""}`;

  return {
    claudeMd,
    harnessFiles,
    appliedHarnesses: harnesses.map((h) => ({ id: h.id, version: h.version })),
    warnings: allWarnings,
  };
}
