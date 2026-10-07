import { globsForHarnessId } from "./harnessRouting.js";

export interface ClaudeRuleFile {
  relPath: string;
  content: string;
}

/** "framework/spring/4.x" -> "framework-spring-4.x.md" — 세그먼트 구분자만 바꾸고 나머지는 보존한다. */
function ruleFilename(harnessId: string): string {
  return `${harnessId.replace(/\//g, "-")}.md`;
}

/**
 * Claude Code는 `.claude/rules/*.md`를 재귀 발견해 자동 로드한다. frontmatter에 `paths:` 글롭이
 * 있으면 그 글롭에 매칭되는 파일을 건드릴 때만 로드하고, 없으면(예: `default`) 매 세션 항상
 * 로드한다 — 그래서 글롭이 없는 하네스는 frontmatter 자체를 생략한다(빈 `paths: []`가 아니라).
 */
export function buildClaudeRuleFile(harnessId: string, harnessMd: string): ClaudeRuleFile {
  const globs = globsForHarnessId(harnessId);
  const frontmatter = globs.length === 0 ? "" : `---\npaths:\n${globs.map((g) => `  - "${g}"`).join("\n")}\n---\n\n`;
  return { relPath: `.claude/rules/${ruleFilename(harnessId)}`, content: frontmatter + harnessMd };
}

interface RuleHarness {
  id: string;
  harnessMd: string;
}

function baseId(id: string): string | null {
  const parts = id.split("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : null;
}

/**
 * `.claude/rules`에는 실제 적용 단위만 쓴다. 버전 하네스는 base의 델타이므로 두 파일을
 * 자동 로드하지 않고, base 본문과 버전 본문을 하나의 버전 파일로 합친다.
 */
export function buildEffectiveClaudeRuleFiles(harnesses: RuleHarness[]): ClaudeRuleFile[] {
  const byId = new Map(harnesses.map((harness) => [harness.id, harness]));
  const shadowedBases = new Set(harnesses.map((harness) => baseId(harness.id)).filter((id): id is string => id !== null));
  return harnesses
    .filter((harness) => !shadowedBases.has(harness.id))
    .map((harness) => {
      const parent = baseId(harness.id);
      const parentHarness = parent ? byId.get(parent) : undefined;
      const content = parentHarness
        ? `${parentHarness.harnessMd.trimEnd()}\n\n---\n\n${harness.harnessMd.trimStart()}`
        : harness.harnessMd;
      return buildClaudeRuleFile(harness.id, content);
    });
}

const BLOCK_START = "<!-- sugo:harness-rules:start -->";
const BLOCK_END = "<!-- sugo:harness-rules:end -->";

function buildManagedBlock(harnessIds: string[]): string {
  const list = harnessIds.length === 0 ? "(적용된 하네스 없음)" : harnessIds.map((id) => `- \`${id}\``).join("\n");
  return `${BLOCK_START}
<!-- 이 블록은 sugo가 자동 관리합니다. 손으로 고치면 다음 sugo_add/sugo_update 때 덮어써집니다. -->
## Sugo 하네스

이 프로젝트에 적용된 코딩 표준이 \`.claude/rules/\`에 자동 로드되도록 설치돼 있습니다.
전문은 \`sugo/harness/<id>/harness.md\`, 검증 설정은 \`sugo/harness/<id>/validation.yaml\`에 있습니다.

${list}
${BLOCK_END}`;
}

/**
 * 프로젝트 루트 CLAUDE.md에 sugo 관리 블록을 넣거나 갱신한다. 사람이 쓴 나머지 내용은 그대로
 * 두고 블록만 교체한다 — 블록이 없으면 파일 끝에 추가한다. 같은 하네스 목록이면 `changed:false`를
 * 돌려줘서 호출부가 불필요한 파일쓰기(타임스탬프 갱신 등)를 건너뛸 수 있게 한다.
 */
export function mergeRootClaudeReference(
  existing: string | null,
  appliedHarnessIds: string[],
): { content: string; changed: boolean } {
  const block = buildManagedBlock(appliedHarnessIds);
  const base = existing ?? "";

  const startIdx = base.indexOf(BLOCK_START);
  const endIdx = base.indexOf(BLOCK_END);

  if (startIdx === -1 || endIdx === -1) {
    const separator = base.length > 0 && !base.endsWith("\n\n") ? (base.endsWith("\n") ? "\n" : "\n\n") : "";
    return { content: base + separator + block + "\n", changed: true };
  }

  const before = base.slice(0, startIdx);
  const after = base.slice(endIdx + BLOCK_END.length);
  const content = before + block + after;
  return { content, changed: content !== base };
}
