import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { INVARIANTS } from "../src/ontology/model.js";

const SRC = join(__dirname, "..", "src");

function allSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) allSourceFiles(full, acc);
    else if (entry.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

const FILES = allSourceFiles(SRC).map((f) => ({ path: f, rel: relative(SRC, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));

/**
 * §2.6 test 티어 불변식의 **정적 소스 스캔** 강제. LLM 판단이 아니라 문자열 검사로 CI에서 막는다
 * (토큰 0). "규칙을 문서에 적어두면 지켜진다"는 착각을 없애는 게 목적 — 적어둔 규칙 중 기계가
 * 실제로 지킬 수 있는 것만 test 티어로 승격돼 여기 온다.
 */
describe("§2.6 불변식 정적 스캔", () => {
  it("test 티어로 선언된 불변식 중 여기서 강제하는 것들이 모델에 존재한다", () => {
    const testTier = INVARIANTS.filter((i) => i.enforcedBy === "test").map((i) => i.id);
    expect(testTier).toContain("no-fetch-bypass");
    expect(testTier).toContain("single-source");
  });

  describe("no-fetch-bypass — 아웃바운드는 반드시 재시도 큐를 거친다", () => {
    // 대시보드로 나가는 fetch는 client.ts의 sendOnce 하나뿐이어야 한다. 다른 곳에서 직접
    // fetch하면 실패가 큐에 안 쌓여 조용히 유실된다(no-silent-loss도 같이 깨진다).
    const ALLOWED = new Set(["dashboard/client.ts", "dashboard/fetch.ts", "harness/harnessFetcher.ts"]);

    it("dashboard/ 하위에서 fetch( 직접 호출은 허가된 파일에만 있다", () => {
      const offenders = FILES.filter(
        (f) => f.rel.startsWith("dashboard/") && !ALLOWED.has(f.rel) && /(?<![.\w])fetch\s*\(/.test(f.text),
      ).map((f) => f.rel);
      expect(offenders).toEqual([]);
    });

    it("push 래퍼(dashboard/sync.ts)는 pushEvent만 쓰고 fetch를 직접 부르지 않는다", () => {
      const sync = FILES.find((f) => f.rel === "dashboard/sync.ts")!;
      expect(/(?<![.\w])fetch\s*\(/.test(sync.text)).toBe(false);
      expect(sync.text).toContain("pushEvent");
    });

    it("전송 실패 경로가 실제로 큐에 넣는다(enqueueRetry 호출 존재)", () => {
      const client = FILES.find((f) => f.rel === "dashboard/client.ts")!;
      expect(client.text).toContain("enqueueRetry");
    });
  });

  describe("single-source — 판별·파싱·버전은 단일 소스", () => {
    it("PLAN_STATES/PLAN_ACTIONS 리터럴 배열이 온톨로지 밖에 복제돼 있지 않다", () => {
      // 상태 이름 3개 이상이 한 배열 리터럴에 나열되면 손관리 사본을 의심한다.
      const offenders = FILES.filter((f) => !f.rel.startsWith("ontology/")).filter((f) =>
        /\[\s*"INIT"\s*,\s*"SCAN"\s*,\s*"CLARIFY"/.test(f.text),
      ).map((f) => f.rel);
      expect(offenders).toEqual([]);
    });

    it("PREREQUISITES/RESULT_STATE/허용목록은 ontology/derive.ts에서만 정의된다", () => {
      for (const name of ["PREREQUISITES", "RESULT_STATE", "ALLOWED_ACTIONS_BY_STATE"]) {
        const definers = FILES.filter((f) => new RegExp(`export const ${name}\\b`).test(f.text)).map((f) => f.rel);
        expect(definers, `${name} 정의처`).toEqual(["ontology/derive.ts"]);
      }
    });

    it("ACTION_TYPES/WORKFLOW_STATES는 ontology/model.ts에서만 정의된다", () => {
      for (const name of ["ACTION_TYPES", "WORKFLOW_STATES", "OBJECT_TYPES", "INVARIANTS", "BOUNDARIES"]) {
        const definers = FILES.filter((f) => new RegExp(`export const ${name}\\b`).test(f.text)).map((f) => f.rel);
        expect(definers, `${name} 정의처`).toEqual(["ontology/model.ts"]);
      }
    });

    it("model.ts는 선언만 — 함수 정의가 없다(§2 '런타임 로직 없음')", () => {
      const model = FILES.find((f) => f.rel === "ontology/model.ts")!;
      expect(/export function |=>\s*\{/.test(model.text)).toBe(false);
    });

    it("REQ 헤딩 파싱은 한 곳에만 있다(parseReqHeading 복붙 금지)", () => {
      const definers = FILES.filter((f) => /export function parseReqHeading\b/.test(f.text)).map((f) => f.rel);
      expect(definers.length).toBeLessThanOrEqual(1);
    });
  });

  describe("작업 관리 활성 판정 단일소스", () => {
    it("isWorkEnabled는 work/enabled.ts에서만 정의된다", () => {
      const definers = FILES.filter((f) => /export function isWorkEnabled\b/.test(f.text)).map((f) => f.rel);
      expect(definers).toEqual(["work/enabled.ts"]);
    });

    it("작업 관리를 끄는 설정 기반 토글이 없다", () => {
      const offenders = FILES.filter((f) => f.rel !== "work/enabled.ts").filter((f) =>
        /workEnabled\s*[:=]\s*(true|false)/.test(f.text),
      ).map((f) => f.rel);
      expect(offenders).toEqual([]);
    });
  });

  describe("cross-repo-contract — sync payload는 schemaVersion을 싣는다", () => {
    it("DASHBOARD_SYNC_SCHEMA_VERSION은 schemaVersion.ts에서만 정의된다", () => {
      const definers = FILES.filter((f) => /export const DASHBOARD_SYNC_SCHEMA_VERSION\b/.test(f.text)).map((f) => f.rel);
      expect(definers).toEqual(["dashboard/schemaVersion.ts"]);
    });

    it("client.ts가 그 상수를 실제로 payload에 주입한다", () => {
      const client = FILES.find((f) => f.rel === "dashboard/client.ts")!;
      expect(client.text).toContain("DASHBOARD_SYNC_SCHEMA_VERSION");
      expect(client.text).toContain("withSchemaVersion");
    });
  });
});
