import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { loadProjectConfig } from "../harness/config.js";
import { routeHarnessesForFiles } from "../harness/harnessRouting.js";
import { buildClaudeRuleFile } from "../harness/rulesFile.js";
import { mcpAllowPatterns, renderToolMenu, resolveHarnessToolGuides } from "../harness/toolRegistry.js";
import { currentGitBranch, featureBranchName } from "../gitBranch.js";
import { readTodoSpec, todoSpecPath } from "../todoSpec.js";

export const sugoGetProjectContextInputSchema = {
  projectPath: z.string().describe("컨텍스트를 로드할 프로젝트 절대경로"),
  changedFiles: z
    .array(z.string())
    .optional()
    .describe("이번 작업에서 건드릴 파일 목록. 주면 관련 하네스만 선별해 반환한다(생략 시 전량)"),
};

const SugoGetProjectContextArgs = z.object(sugoGetProjectContextInputSchema);

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * sugo가 하네스마다 `.claude/rules/<id>.md`를 직접 쓰므로(Claude Code 자동로드용), 여기서 또
 * 읽어 `harnesses`와 같은 내용을 `rules`에 중복으로 실으면 안 된다. `excludeBasenames`는 그
 * 파일명들이다 — sync.ts의 파일명 규칙(`buildClaudeRuleFile`)과 같은 소스에서 파생한다.
 */
/**
 * 재귀로 읽는다. Claude Code 자신이 `.claude/rules/`를 재귀 자동로드하므로(하위 디렉터리 포함),
 * 최상위만 보면 `pullCheckpointsToRules`가 쓰는 `.claude/rules/<category>/*.md` 같은 걸 놓친다.
 * `excludeBasenames`는 최상위에서만 적용한다 — sugo가 쓴 하네스 파일은 항상 최상위 평면 구조다.
 */
async function readRulesDir(
  rulesDir: string,
  excludeBasenames: Set<string>,
  isTopLevel = true,
): Promise<{ path: string; content: string }[]> {
  let entries;
  try {
    entries = await readdir(rulesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const rules: { path: string; content: string }[] = [];
  for (const entry of entries) {
    const full = join(rulesDir, entry.name);
    if (entry.isDirectory()) {
      rules.push(...(await readRulesDir(full, excludeBasenames, false)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (isTopLevel && excludeBasenames.has(entry.name)) continue;
    const content = await readIfExists(full);
    if (content !== null) rules.push({ path: full, content });
  }
  return rules;
}

/**
 * §5: 서브에이전트가 작업 전 필수로 로드해야 하는 프로젝트 컨텍스트 — sugo/CLAUDE.md(합성 인덱스),
 * 적용된 개별 하네스 본문, .claude/rules/*.md(있으면). 전부 파일이 SOT라 여기서는 그냥 읽어서
 * 모아줄 뿐 판정은 하지 않는다.
 */
export async function handleSugoGetProjectContext(rawArgs: unknown) {
  const args = SugoGetProjectContextArgs.parse(rawArgs);
  const { projectPath, changedFiles } = args;

  const claudeMd = await readIfExists(join(projectPath, "sugo", "CLAUDE.md"));
  const config = await loadProjectConfig(projectPath);

  const loaded: { id: string; harnessMd: string }[] = [];
  if (config) {
    for (const applied of config.appliedHarnesses) {
      const content = await readIfExists(join(projectPath, "sugo", "harness", applied.id, "harness.md"));
      if (content !== null) loaded.push({ id: applied.id, harnessMd: content });
    }
  }

  // 변경 파일을 알면 그 파일에 해당하는 하네스만 싣는다. 인식 못 하는 파일뿐이면 좁히지 않는다 —
  // 규칙이 과하게 오는 건 소음이지만 빠지는 건 표준이 조용히 약해지는 것이다.
  const routing = routeHarnessesForFiles(
    loaded.map((h) => h.id),
    changedFiles ?? [],
  );
  const harnesses = loaded.filter((h) => routing.selected.includes(h.id));

  const sugoManagedRuleFiles = new Set(loaded.map((h) => basename(buildClaudeRuleFile(h.id, "").relPath)));
  const rules = await readRulesDir(join(projectPath, ".claude", "rules"), sugoManagedRuleFiles);

  // ── §2 하네스 도구 디스패치: 적용된 하네스에 매칭되는 특화 MCP 도구 안내를 실어준다.
  // 레지스트리가 비어있으면(기본값) toolMenu는 빈 문자열 — 조용히 아무 것도 없음.
  const harnessToolGuides = resolveHarnessToolGuides(routing.selected);

  // ── §4.3-T `.claude/rules/` 스캔과 별개다. 사람이 규칙 파일을 심어야만 동작하는 방식이 아니라,
  // feature/* 브랜치 패턴만 맞으면 sessionId 없이도(다른 스킬 진입점이어도) 무조건 동작한다.
  const branch = await currentGitBranch(projectPath);
  const fName = featureBranchName(branch);
  const todoSpec = fName
    ? { featureName: fName, path: todoSpecPath(projectPath, fName), content: await readTodoSpec(projectPath, fName) }
    : null;

  const payload = {
    ok: true,
    projectPath,
    registered: !!config,
    claudeMd,
    harnesses,
    rules,
    todoSpec,
    // 무엇을 왜 뺐는지 드러낸다 — 조용히 줄어든 규칙은 줄어든 줄도 모른다.
    harnessRouting: {
      changedFiles: changedFiles ?? [],
      selected: routing.selected,
      excluded: routing.excluded,
      unmatchedFiles: routing.unmatchedFiles,
      fellBackToAll: routing.fellBackToAll,
    },
    harnessTools: {
      guides: harnessToolGuides,
      mcpAllowPatterns: mcpAllowPatterns(harnessToolGuides),
      toolMenu: renderToolMenu(harnessToolGuides),
    },
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
