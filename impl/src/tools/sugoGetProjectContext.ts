import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { loadProjectConfig } from "../harness/config.js";

export const sugoGetProjectContextInputSchema = {
  projectPath: z.string().describe("컨텍스트를 로드할 프로젝트 절대경로"),
};

const SugoGetProjectContextArgs = z.object(sugoGetProjectContextInputSchema);

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function readRulesDir(projectPath: string): Promise<{ path: string; content: string }[]> {
  const rulesDir = join(projectPath, ".claude", "rules");
  let entries;
  try {
    entries = await readdir(rulesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const rules: { path: string; content: string }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const full = join(rulesDir, entry.name);
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
  const { projectPath } = args;

  const claudeMd = await readIfExists(join(projectPath, "sugo", "CLAUDE.md"));
  const config = await loadProjectConfig(projectPath);

  const harnesses: { id: string; harnessMd: string }[] = [];
  if (config) {
    for (const applied of config.appliedHarnesses) {
      const content = await readIfExists(join(projectPath, "sugo", "harness", applied.id, "harness.md"));
      if (content !== null) harnesses.push({ id: applied.id, harnessMd: content });
    }
  }

  const rules = await readRulesDir(projectPath);

  const payload = {
    ok: true,
    projectPath,
    registered: !!config,
    claudeMd,
    harnesses,
    rules,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
