import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * MCP 도구명은 클라이언트에서 **서버들 사이 전역으로** 노출된다(플러그인 번들 서버는
 * `mcp__plugin_<plugin>_<server>__<tool>` 형태로 나간다). 접두어 없는 이름은 다른 서버의
 * 같은 이름과 부딪힐 여지를 남긴다.
 *
 * 29개 중 `version` 하나만 접두어가 없었고, 콜드 환경 스모크로 도구 목록을 눈으로 훑다가
 * 발견했다 — 단위테스트는 핸들러만 직접 호출해서 **등록된 이름을 아무도 안 보고 있었다.**
 */
const indexSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts"),
  "utf-8",
);

function registeredToolNames(): string[] {
  return [...indexSource.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("MCP 도구 이름 규약", () => {
  it("등록된 도구를 실제로 찾는다(정규식이 헛도는 걸 방지)", () => {
    expect(registeredToolNames().length).toBeGreaterThanOrEqual(29);
  });

  it("모든 도구가 sugo_ 접두어를 가진다", () => {
    const offenders = registeredToolNames().filter((n) => !n.startsWith("sugo_"));
    expect(offenders).toEqual([]);
  });

  it("중복 등록된 이름이 없다", () => {
    const names = registeredToolNames();
    expect(names.length).toBe(new Set(names).size);
  });
});
