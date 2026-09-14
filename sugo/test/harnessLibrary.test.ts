import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { parseValidationYaml } from "../src/harness/validationConfig.js";

const libraryDir = join(dirname(fileURLToPath(import.meta.url)), "..", "harness-library");

/**
 * 하네스 디렉터리 = validation.yaml을 가진 디렉터리. 버전 하네스(`lang/java/21`)도 같은 규칙이라
 * 깊이를 고정하지 않고 재귀로 찾는다.
 */
function findHarnessDirs(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (existsSync(join(full, "validation.yaml"))) acc.push(full);
    findHarnessDirs(full, acc);
  }
  return acc;
}

/** 경로를 harnessId 표기(POSIX 구분자)로 바꾼다 — 윈도우에서도 같은 값이 나와야 한다. */
function harnessIdFromPath(fullPath: string): string {
  return relative(libraryDir, fullPath).split(sep).join("/");
}

const harnessDirs = findHarnessDirs(libraryDir);

interface RawCheck {
  id?: unknown;
  description?: unknown;
  severity?: unknown;
}
interface RawYaml {
  harnessId?: unknown;
  checks?: RawCheck[];
}

describe("harness-library 구조 가드", () => {
  it("하네스를 실제로 찾아낸다(워커가 헛돌지 않는지)", () => {
    // 워커가 조용히 빈 배열을 돌려주면 아래 모든 검사가 0건 통과로 위장된다.
    expect(harnessDirs.length).toBeGreaterThanOrEqual(40);
  });

  it("모든 하네스에 harness.md와 validation.yaml이 함께 있다", () => {
    const missing = harnessDirs.filter((d) => !existsSync(join(d, "harness.md"))).map(harnessIdFromPath);
    expect(missing).toEqual([]);
  });

  it("모든 harness.md에 '## 핵심 규칙' 섹션이 있다", () => {
    // 없으면 harnessComposer가 CLAUDE.md에 "(핵심 규칙 섹션 없음)"을 싣는다 — 조용히 빈 요약이 된다.
    const withoutSection = harnessDirs
      .filter((d) => !/^#{1,3}\s*핵심 규칙/m.test(readFileSync(join(d, "harness.md"), "utf-8")))
      .map(harnessIdFromPath);
    expect(withoutSection).toEqual([]);
  });

  it("선언된 harnessId가 디렉터리 경로와 정확히 일치한다", () => {
    // 어긋나면 loadProjectValidationConfigs의 맵 키가 빗나가 그 하네스의 체크가 통째로
    // fabricated로 떨어진다 — 규칙이 있는데 아무도 적용받지 않는 상태가 조용히 만들어진다.
    const mismatched = harnessDirs
      .map((d) => ({ expected: harnessIdFromPath(d), declared: parseValidationYaml(readFileSync(join(d, "validation.yaml"), "utf-8")).harnessId }))
      .filter((x) => x.expected !== x.declared);
    expect(mismatched).toEqual([]);
  });
});

describe("harness-library validation.yaml 내용 가드", () => {
  // parseValidationYaml은 관대하다(harnessId 누락→"unknown", severity 오타→"warning", id 없으면 제외).
  // 파싱 결과만 보면 그 문제들이 정규화돼 사라지므로 원본 YAML을 직접 검사한다.
  const rawByHarness = harnessDirs.map((d) => ({
    id: harnessIdFromPath(d),
    raw: load(readFileSync(join(d, "validation.yaml"), "utf-8")) as RawYaml | null,
  }));

  it("harnessId 키가 실제로 존재한다(누락 시 파서가 'unknown'으로 삼킨다)", () => {
    const missing = rawByHarness.filter((h) => typeof h.raw?.harnessId !== "string").map((h) => h.id);
    expect(missing).toEqual([]);
  });

  it("모든 체크에 id가 있다(없으면 파서가 조용히 버린다)", () => {
    const offenders = rawByHarness
      .filter((h) => (h.raw?.checks ?? []).some((c) => typeof c?.id !== "string" || c.id.length === 0))
      .map((h) => h.id);
    expect(offenders).toEqual([]);
  });

  it("모든 체크의 severity가 error 또는 warning으로 명시돼 있다", () => {
    // `severity: eror` 같은 오타는 파서가 warning으로 강등한다 — MUST-BLOCK이 신호 없이 사라진다.
    const offenders: string[] = [];
    for (const h of rawByHarness) {
      for (const c of h.raw?.checks ?? []) {
        if (c?.severity !== "error" && c?.severity !== "warning") offenders.push(`${h.id}:${String(c?.id)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("모든 체크에 비어있지 않은 description이 있다", () => {
    const offenders: string[] = [];
    for (const h of rawByHarness) {
      for (const c of h.raw?.checks ?? []) {
        if (typeof c?.description !== "string" || c.description.trim().length === 0) offenders.push(`${h.id}:${String(c?.id)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("하네스 안에서 checkId가 중복되지 않는다", () => {
    // 중복이면 computeValidationVerdict의 find가 항상 첫 항목만 집어 뒤쪽 severity가 무시된다.
    const offenders: string[] = [];
    for (const h of rawByHarness) {
      const ids = (h.raw?.checks ?? []).map((c) => String(c?.id));
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length > 0) offenders.push(`${h.id}: ${[...new Set(dupes)].join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("체크가 하나도 없는 하네스가 없다", () => {
    const empty = rawByHarness.filter((h) => (h.raw?.checks ?? []).length === 0).map((h) => h.id);
    expect(empty).toEqual([]);
  });

  it("모든 auto 선언이 유효하다", () => {
    // parseValidationYaml은 잘못된 auto를 던진다 — 라이브러리에 그런 게 섞이면 그 하네스를 읽는
    // 프로젝트에서 통째로 로드가 실패한다. 배포 전에 여기서 잡는다.
    const offenders: string[] = [];
    for (const dir of harnessDirs) {
      try {
        parseValidationYaml(readFileSync(join(dir, "validation.yaml"), "utf-8"));
      } catch (e) {
        offenders.push(`${harnessIdFromPath(dir)}: ${(e as Error).message}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("auto가 붙은 체크가 실제로 존재한다(선언 층이 죽지 않았는지)", () => {
    // 전부 자기보고로 되돌아가면 이 층이 있으나 마나가 된다 — 숫자로 못박는다.
    const autoCount = harnessDirs
      .flatMap((d) => parseValidationYaml(readFileSync(join(d, "validation.yaml"), "utf-8")).checks)
      .filter((c) => c.auto !== null).length;
    expect(autoCount).toBeGreaterThanOrEqual(15);
  });
});
