import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_TYPES,
  ALL_STATUSES,
  BOUNDARIES,
  INVARIANTS,
  LINK_TYPES,
  OBJECT_TYPES,
  ONTOLOGY,
  OWNERSHIP,
  WORKFLOW_STATES,
} from "../src/ontology/model.js";
import { PLAN_ACTIONS, PLAN_STATES } from "../src/types.js";
import { ROADMAP_LEVELS, ROADMAP_NODE_STATUSES } from "../src/hulk/types.js";

/**
 * §2.6 drift lock — 온톨로지(선언)와 런타임(plan/types, hulk/types)이 갈라지는 순간 실패한다.
 * 이 테스트가 없으면 model.ts는 "예쁜 문서"로 전락하고, 실제 강제력은 손관리 상수로 되돌아간다.
 */
describe("§2 온톨로지 drift lock", () => {
  const packageRoot = resolve(__dirname, "..");
  it("WORKFLOW_STATES가 PLAN_STATES의 정본이다(순서까지 동일)", () => {
    expect([...PLAN_STATES]).toEqual([...WORKFLOW_STATES]);
  });

  it("WORKFLOW_STATES는 §2.3대로 19개다", () => {
    expect(WORKFLOW_STATES).toHaveLength(19);
  });

  it("ACTION_TYPES의 name 집합이 PLAN_ACTIONS와 정확히 일치한다(양방향 차집합 0)", () => {
    const ontology = new Set<string>(ACTION_TYPES.map((a) => a.name));
    const runtime = new Set<string>(PLAN_ACTIONS);
    expect([...ontology].filter((n) => !runtime.has(n))).toEqual([]);
    expect([...runtime].filter((n) => !ontology.has(n))).toEqual([]);
  });

  it("ACTION_TYPES는 §4대로 24개다", () => {
    // 23 → 24: §4.3-R test_reverify 추가(2026-09-22).
    expect(ACTION_TYPES).toHaveLength(24);
  });

  it("OBJECT_TYPES.name 유니온 == RoadmapLevel", () => {
    expect(OBJECT_TYPES.map((o) => o.name)).toEqual([...ROADMAP_LEVELS]);
  });

  it("ALL_STATUSES == RoadmapNodeStatus", () => {
    expect([...ALL_STATUSES]).toEqual([...ROADMAP_NODE_STATUSES]);
  });

  it("모든 fromStates/toState가 실재하는 상태를 가리킨다(오타 잠금)", () => {
    const known = new Set<string>(WORKFLOW_STATES);
    for (const a of ACTION_TYPES) {
      for (const s of a.fromStates ?? []) expect(known.has(s), `${a.name}.fromStates: ${s}`).toBe(true);
      if (a.toState !== null) expect(known.has(a.toState), `${a.name}.toState: ${a.toState}`).toBe(true);
    }
  });

  it("containedBy가 실재하는 오브젝트를 가리킨다(spec만 최상위)", () => {
    const known = new Set<string>(OBJECT_TYPES.map((o) => o.name));
    const roots = OBJECT_TYPES.filter((o) => o.containedBy === null);
    expect(roots.map((o) => o.name)).toEqual(["spec"]);
    for (const o of OBJECT_TYPES) {
      if (o.containedBy !== null) expect(known.has(o.containedBy), `${o.name}.containedBy`).toBe(true);
    }
  });

  it("BOUNDARIES.invariantIds가 전부 실재하는 불변식을 가리킨다", () => {
    const known = new Set<string>(INVARIANTS.map((i) => i.id));
    for (const b of BOUNDARIES) {
      for (const id of b.invariantIds) expect(known.has(id), `${b.name} → ${id}`).toBe(true);
    }
  });

  it("enforcedBy는 gate/test/doc 3종뿐이고 test 티어는 정적 스캔으로 실제 강제된다", () => {
    for (const i of INVARIANTS) expect(["gate", "test", "doc"]).toContain(i.enforcedBy);
    // §2.6이 정적 스캔으로 CI 강제한다고 명시한 것들
    const byId = new Map(INVARIANTS.map((i) => [i.id, i.enforcedBy]));
    expect(byId.get("no-fetch-bypass")).toBe("test");
    expect(byId.get("single-source")).toBe("test");
  });

  it("모든 불변식은 실제 구현 근거를 가지며 대표 근거가 enforcedBy와 일치한다", () => {
    for (const invariant of INVARIANTS) {
      expect(invariant.enforcementRefs.length, `${invariant.id}.enforcementRefs`).toBeGreaterThan(0);
      expect(
        invariant.enforcementRefs.some((ref) => ref.kind === invariant.enforcedBy),
        `${invariant.id}: ${invariant.enforcedBy} 대표 근거 없음`,
      ).toBe(true);
    }
  });

  it("불변식 구현 근거의 경로와 선택적 심볼이 실제로 존재한다", () => {
    for (const invariant of INVARIANTS) {
      for (const ref of invariant.enforcementRefs) {
        const absolutePath = resolve(packageRoot, ref.path);
        expect(existsSync(absolutePath), `${invariant.id}: ${ref.path}`).toBe(true);
        if (ref.symbol) {
          expect(readFileSync(absolutePath, "utf8"), `${invariant.id}: ${ref.path}#${ref.symbol}`).toContain(ref.symbol);
        }
      }
    }
  });

  it("한 불변식 안에 같은 구현 근거를 중복 선언하지 않는다", () => {
    for (const invariant of INVARIANTS) {
      const keys = invariant.enforcementRefs.map((ref) => `${ref.kind}:${ref.path}:${ref.symbol ?? ""}`);
      expect(new Set(keys).size, `${invariant.id} 근거 중복`).toBe(keys.length);
    }
  });

  it("id/name에 중복이 없다", () => {
    const dedupe = (xs: readonly string[]) => new Set(xs).size === xs.length;
    expect(dedupe(ACTION_TYPES.map((a) => a.name))).toBe(true);
    expect(dedupe(OBJECT_TYPES.map((o) => o.name))).toBe(true);
    expect(dedupe(LINK_TYPES.map((l) => l.name))).toBe(true);
    expect(dedupe(INVARIANTS.map((i) => i.id))).toBe(true);
    expect(dedupe(BOUNDARIES.map((b) => b.name))).toBe(true);
    expect(dedupe(OWNERSHIP.map((o) => o.concept))).toBe(true);
  });

  it("ONTOLOGY 단일 export가 모든 섹션을 담는다(sugo_ontology 조회 표면)", () => {
    expect(Object.keys(ONTOLOGY).sort()).toEqual(
      [
        "actionTypes",
        "allStatuses",
        "boundaries",
        "cancellableStates",
        "invariants",
        "linkTypes",
        "objectTypes",
        "ownership",
        "startStates",
        "workflowStates",
      ].sort(),
    );
  });

  it("v2 데드락 수정 2건이 모델에 박혀 있다(회귀 방지)", () => {
    const oracle = ACTION_TYPES.find((a) => a.name === "oracle_done")!;
    expect([...(oracle.fromStates ?? [])].sort()).toEqual(["JIRA", "PRD"]);
    expect(oracle.toState).toBeNull(); // 상태 미전이 — 기록만

    const codeStart = ACTION_TYPES.find((a) => a.name === "code_start")!;
    expect([...(codeStart.fromStates ?? [])].sort()).toEqual(["CODE_READY", "REVIEW_RUNNING", "TEST_DONE"]);
  });

  it("게이트는 실제 차단 액션과 증거·강제방식을 구조적으로 설명한다", () => {
    for (const action of ACTION_TYPES) {
      const gateIds = action.gates.map((gate) => gate.gateId);
      expect(new Set(gateIds).size, `${action.name} gateId 중복`).toBe(gateIds.length);
      for (const gate of action.gates) {
        expect(typeof gate, `${action.name} gate가 문자열 사본이면 안 됨`).toBe("object");
        expect(gate.gateId).toMatch(/^[A-Z][A-Z0-9_]+$/);
        expect(gate.checkedOnAction).toBe(action.name);
        expect(gate.evidenceSource.length).toBeGreaterThan(0);
        expect(["hard", "hard-with-explicit-bypass"]).toContain(gate.enforcement);
      }
    }
  });

  it("SPEC oracle 게이트는 기록 액션이 아니라 실제 차단 액션 ready에 걸린다", () => {
    const gateIds = (actionName: string) =>
      ACTION_TYPES.find((action) => action.name === actionName)!.gates.map((gate) => gate.gateId);

    expect(gateIds("oracle_done")).not.toContain("SPEC_ORACLE_NOT_RUN");
    expect(gateIds("oracle_done")).toContain("ORACLE_OVERRIDE_REASON_REQUIRED");
    expect(gateIds("ready")).toContain("SPEC_ORACLE_NOT_RUN");
  });

  it("과거 설명용 별칭이 아니라 런타임의 실제 차단 코드를 사용한다", () => {
    const allGateIds = ACTION_TYPES.flatMap((action) => action.gates.map((gate) => gate.gateId));
    expect(allGateIds).toContain("CONFORMANCE_LEDGER_INCOMPLETE");
    expect(allGateIds).toContain("BASELINE_NOT_GREEN");
    expect(allGateIds).toContain("CONTRACT_NOT_STARTED");
    expect(allGateIds).toContain("WIRING_TEST_MISSING");
    expect(allGateIds).toContain("BOOT_GATE_FAILED");
    expect(allGateIds).not.toContain("CONFORMANCE_LEDGER");
    expect(allGateIds).not.toContain("BASELINE_RED");
    expect(allGateIds).not.toContain("BASELINE_NOT_RUN");
    expect(allGateIds).not.toContain("CONTRACT_NOT_AUTHORED");
    expect(allGateIds).not.toContain("WIRING_GATE_NOT_SATISFIED");
    expect(allGateIds).not.toContain("BOOT_GATE_NOT_SATISFIED");
  });
});
