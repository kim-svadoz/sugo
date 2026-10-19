import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * "4파일 하드 규칙"을 실제 파일에 대고 검사한다. syncVersion.test.ts는 순수 함수만 보므로
 * 하위 파일을 손으로 고쳐 정본과 어긋나게 만든 드리프트는 잡히지 않는다 — 예를 들어 plugin.json과
 * marketplace.json만 수기로 올려 package.json과 갈라지는 경우다. 그 경로를 막는다.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments: string[]) => JSON.parse(readFileSync(join(root, ...segments), "utf8"));

describe("4파일 하드 규칙 — 실제 파일 정합성", () => {
  const version: string = read("package.json").version;

  it("정본 package.json의 version이 semver 형식이다", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it(".claude-plugin/plugin.json이 정본을 따른다", () => {
    expect(read(".claude-plugin", "plugin.json").version).toBe(version);
  });

  it("package-lock.json의 두 곳이 모두 정본을 따른다", () => {
    const lock = read("package-lock.json");
    expect(lock.version).toBe(version);
    expect(lock.packages[""].version).toBe(version);
  });

  it("마켓플레이스의 sugo 항목이 정본을 따른다", () => {
    const entry = read("..", ".claude-plugin", "marketplace.json").plugins.find(
      (p: { name: string }) => p.name === "sugo",
    );
    expect(entry).toBeDefined();
    expect(entry.version).toBe(version);
  });

  it("빌드 산출물에 주입된 __SUGO_VERSION__이 정본과 같다", () => {
    // build.mjs가 esbuild define으로 리터럴 치환하므로, 번들에 정본 버전 문자열이 그대로 박힌다.
    // 재빌드를 빼먹고 커밋하면 sugo_version이 옛 버전을 보고하게 되는데, 이 검사가 막는다.
    const bundle = readFileSync(join(root, "dist", "index.bundle.mjs"), "utf8");
    expect(bundle).toContain(`"${version}"`);
  });
});
