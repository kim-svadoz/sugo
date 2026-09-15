import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoUpdate } from "../src/tools/sugoUpdate.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args?: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-rules-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-rules-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("sugo_add — .claude/rules/ 실배선", () => {
  it("감지된 하네스마다 .claude/rules/*.md를 실제로 쓴다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });

    expect(existsSync(join(projectDir, ".claude", "rules", "default.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".claude", "rules", "lang-typescript.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".claude", "rules", "framework-react.md"))).toBe(true);

    const tsRule = readFileSync(join(projectDir, ".claude", "rules", "lang-typescript.md"), "utf-8");
    expect(tsRule).toContain("paths:");
    expect(tsRule).toContain('"**/*.ts"');

    // default는 항상 로드돼야 하므로 paths가 없어야 한다.
    const defaultRule = readFileSync(join(projectDir, ".claude", "rules", "default.md"), "utf-8");
    expect(defaultRule.startsWith("---")).toBe(false);
  });

  it("루트 CLAUDE.md에 sugo 관리 블록을 추가한다(Claude Code가 세션 시작 시 자동으로 읽는 파일)", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: {} }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });

    const rootClaude = readFileSync(join(projectDir, "CLAUDE.md"), "utf-8");
    expect(rootClaude).toContain("sugo:harness-rules:start");
    expect(rootClaude).toContain("lang/typescript");
  });

  it("이미 사람이 쓴 루트 CLAUDE.md가 있으면 그 내용을 보존한다", async () => {
    writeFileSync(join(projectDir, "CLAUDE.md"), "# 우리 프로젝트\n\n온보딩 문서입니다.\n");
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: {} }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });

    const rootClaude = readFileSync(join(projectDir, "CLAUDE.md"), "utf-8");
    expect(rootClaude).toContain("온보딩 문서입니다.");
    expect(rootClaude).toContain("sugo:harness-rules:start");
  });

  it("sugo/CLAUDE.md는 내용이 안 바뀌면 재기록을 생략한다(§2 step 4)", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: {} }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });
    const first = readFileSync(join(projectDir, "sugo", "CLAUDE.md"), "utf-8");

    await call(handleSugoUpdate, { projectPath: projectDir }); // 스택 그대로 재동기화
    const second = readFileSync(join(projectDir, "sugo", "CLAUDE.md"), "utf-8");

    expect(second).toBe(first); // 타임스탬프까지 완전히 동일 — 재기록 자체가 없었다는 뜻
  });

  it("실제로 스택이 바뀌면 sugo/CLAUDE.md도 갱신된다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: {} }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });
    const before = readFileSync(join(projectDir, "sugo", "CLAUDE.md"), "utf-8");

    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    await call(handleSugoUpdate, { projectPath: projectDir });
    const after = readFileSync(join(projectDir, "sugo", "CLAUDE.md"), "utf-8");

    expect(after).not.toBe(before);
    expect(after).toContain("framework/react");
  });

  it("sugo_update로 스택이 줄어들면 더 이상 안 쓰는 하네스의 규칙 파일을 지운다", async () => {
    // 처음엔 React까지 감지되게, 이후엔 React 의존성을 빼서 다시 update.
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });
    expect(existsSync(join(projectDir, ".claude", "rules", "framework-react.md"))).toBe(true);

    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await call(handleSugoUpdate, { projectPath: projectDir });

    expect(existsSync(join(projectDir, ".claude", "rules", "framework-react.md"))).toBe(false);
    expect(existsSync(join(projectDir, ".claude", "rules", "default.md"))).toBe(true);
  });
});
