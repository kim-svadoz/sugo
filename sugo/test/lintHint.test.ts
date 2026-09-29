import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// .mjs 훅 모듈(allowJs로 해석) — 순수함수만 가져온다. scope-guard.test.ts와 같은 패턴.
import { findProjectRoot, formatFailureSummary, pickLintCommand, withinCooldown } from "../hooks/lint-hint.mjs";

let tmpDirs: string[] = [];

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "sugo-linthint-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe("findProjectRoot — sugo/config.json을 위로 올라가며 찾는다", () => {
  it("바로 위 디렉터리에 sugo/config.json이 있으면 그 디렉터리를 반환한다", () => {
    const dir = makeProject();
    mkdirSync(join(dir, "sugo"), { recursive: true });
    writeFileSync(join(dir, "sugo", "config.json"), "{}");
    expect(findProjectRoot(join(dir, "src", "foo.ts"))).toBe(dir);
  });

  it("여러 단계 위에 있어도 찾는다", () => {
    const dir = makeProject();
    mkdirSync(join(dir, "sugo"), { recursive: true });
    writeFileSync(join(dir, "sugo", "config.json"), "{}");
    expect(findProjectRoot(join(dir, "a", "b", "c", "foo.ts"))).toBe(dir);
  });

  it("등록되지 않은 프로젝트면 null을 반환한다(간섭하지 않는다)", () => {
    const dir = makeProject();
    expect(findProjectRoot(join(dir, "src", "foo.ts"))).toBeNull();
  });

  it("filePath가 비어 있으면 null", () => {
    expect(findProjectRoot("")).toBeNull();
  });
});

describe("pickLintCommand — 추측하지 않는다", () => {
  it("detectedStack.commands.lint가 있으면 그대로 반환한다", () => {
    expect(pickLintCommand({ detectedStack: { commands: { lint: "npm run lint" } } })).toBe("npm run lint");
  });

  it("lint 명령이 없으면 null(다른 명령으로 대체 추측하지 않는다)", () => {
    expect(pickLintCommand({ detectedStack: { commands: { build: "npm run build" } } })).toBeNull();
  });

  it("detectedStack 자체가 없어도 안전하게 null", () => {
    expect(pickLintCommand({})).toBeNull();
    expect(pickLintCommand(null)).toBeNull();
  });

  it("lint가 빈 문자열이면 null 취급한다", () => {
    expect(pickLintCommand({ detectedStack: { commands: { lint: "   " } } })).toBeNull();
  });
});

describe("withinCooldown — 마지막 실행 이후 짧은 시간 안이면 건너뛴다", () => {
  const now = Date.parse("2026-09-29T00:00:10.000Z");

  it("lastRunAt이 없으면(첫 실행) 쿨다운 아님", () => {
    expect(withinCooldown(null, now, 8000)).toBe(false);
  });

  it("쿨다운 안(예: 3초 전)이면 true", () => {
    expect(withinCooldown("2026-09-29T00:00:07.000Z", now, 8000)).toBe(true);
  });

  it("쿨다운 밖(예: 10초 전)이면 false", () => {
    expect(withinCooldown("2026-09-29T00:00:00.000Z", now, 8000)).toBe(false);
  });

  it("깨진 타임스탬프는 안전하게 false(쿨다운 없음 취급)", () => {
    expect(withinCooldown("not-a-date", now, 8000)).toBe(false);
  });
});

describe("formatFailureSummary — 사람이 읽을 요약", () => {
  it("명령/종료코드/출력을 포함한다", () => {
    const msg = formatFailureSummary("npm run lint", 1, "src/foo.ts:1 error");
    expect(msg).toContain("npm run lint");
    expect(msg).toContain("1");
    expect(msg).toContain("src/foo.ts:1 error");
  });

  it("긴 출력은 꼬리만 남기고 자른다(컨텍스트 낭비 방지)", () => {
    const longOutput = "x".repeat(5000);
    const msg = formatFailureSummary("npm run lint", 1, longOutput, 100);
    expect(msg.length).toBeLessThan(longOutput.length);
    expect(msg).toContain("생략");
  });
});
