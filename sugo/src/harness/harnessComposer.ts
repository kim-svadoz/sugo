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
> 이 파일 자체는 참고용 인덱스입니다 — Claude Code가 세션 시작 시 자동으로 읽는 건
> \`.claude/rules/*.md\`와 프로젝트 루트 \`CLAUDE.md\`이며, 여기 있는 요약은 그걸 보완합니다.
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

sugo 파이프라인의 순서강제·콘텐츠 게이트(analyze 호출강제, baseline, wiring/glue/boot, 테스트증거대조,
review 4중검증 등)는 실제로 집행됩니다(\`sugo_plan\` 상태머신). 위 표의 각 하네스 \`validation.yaml\`은
\`sugo_validate\`(review 단계)가 대조합니다 — 그중 \`auto\`가 선언된 체크는 서버가 파일을 직접 읽어
실측하고, 그 결과가 에이전트의 자기보고보다 우선합니다(주장과 어긋나면 \`contradictions\`에 남습니다).
**다만 아직 모든 체크가 실측되는 건 아닙니다** — 대부분은 review-agent의 자기보고이고,
\`review_done\`이 검증 실패를 이유로 파이프라인을 막는 하드 게이트로 승격되지도 않았습니다.
"핵심 규칙 요약"은 그 차이를 알고 참고 자료로 활용하세요.

${allWarnings.length > 0 ? `## 경고\n\n${allWarnings.map((w) => `- ${w}`).join("\n")}\n` : ""}`;

  return {
    claudeMd,
    harnessFiles,
    appliedHarnesses: harnesses.map((h) => ({ id: h.id, version: h.version })),
    warnings: allWarnings,
  };
}
