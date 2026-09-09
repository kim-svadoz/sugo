import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 이식성 회귀 가드 — 대시보드가 Windows/mac 어느 쪽에서도 같게 돌게 유지한다.
 *
 * 플러그인(`sugo/test/crossPlatform.test.ts`)에 같은 성격의 가드를 두고 나서, 대시보드
 * 시드 스크립트에 `C:/Users/user/...`가, e2e 스크린샷 경로에 `/tmp/...`가 남아 있는 걸
 * 뒤늦게 발견했다. 한쪽만 막으면 반대쪽으로 다시 들어온다.
 *
 * 규칙은 좁게 유지한다 — 넓은 린트는 오탐이 쌓이면 아무도 안 보게 된다.
 */

const here = dirname(fileURLToPath(import.meta.url));
const dashboard = join(here, "..", "..");

const SCAN_ROOTS = [
  join(dashboard, "backend", "src"),
  join(dashboard, "frontend", "src"),
  join(dashboard, "e2e"),
];
const SCAN_FILES = [join(dashboard, "backend", "dev-local.mts")];
const SKIP_DIRS = new Set(["node_modules", "dist", "build"]);

function collect(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts|mjs)$/.test(name)) out.push(full);
    }
  };
  for (const root of SCAN_ROOTS) walk(root);
  for (const f of SCAN_FILES) out.push(f);
  return out;
}

/** 주석은 제외 — 설명글의 예시 경로까지 잡으면 가드가 오탐으로 죽는다. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
}

describe("이식성 가드 — 대시보드에 이 PC 전용 가정이 없다", () => {
  it("드라이브 문자 절대경로(C:/… , C:\\… )가 하드코딩돼 있지 않다", () => {
    const offenders = collect().filter((f) => /["'`][A-Za-z]:[\\/]/.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("POSIX 전용 /tmp 경로가 하드코딩돼 있지 않다(os.tmpdir()을 쓸 것)", () => {
    const offenders = collect().filter((f) => /["'`]\/tmp\//.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("process.platform 분기가 없다(생긴다면 양쪽 분기를 테스트로 덮을 것)", () => {
    const offenders = collect().filter((f) => stripComments(readFileSync(f, "utf8")).includes("process.platform"));
    expect(offenders).toEqual([]);
  });
});
