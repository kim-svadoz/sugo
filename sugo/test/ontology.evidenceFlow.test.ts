import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_TYPES, EVIDENCE_FLOWS } from "../src/ontology/model.js";

const indexSource = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8");

describe("P4 evidence producer/consumer contract", () => {
  it("모든 증거 producer 도구와 consumer action이 실제 선언에 존재한다", () => {
    const actions = new Set<string>(ACTION_TYPES.map((action) => action.name));
    for (const flow of EVIDENCE_FLOWS) {
      expect(indexSource, `${flow.id} producer ${flow.producedBy}`).toContain(`"${flow.producedBy}"`);
      for (const consumer of flow.consumedBy) expect(actions.has(consumer), `${flow.id} consumer ${consumer}`).toBe(true);
    }
  });

  it("producer 또는 consumer가 없는 장식용 증거 선언을 허용하지 않는다", () => {
    for (const flow of EVIDENCE_FLOWS) {
      expect(flow.producedBy.length, flow.id).toBeGreaterThan(0);
      expect(flow.consumedBy.length, flow.id).toBeGreaterThan(0);
      expect(flow.storageRef.length, flow.id).toBeGreaterThan(0);
    }
  });

  it("현재 저장 증거 6종의 독립 골든 집합과 정확히 일치한다", () => {
    expect(EVIDENCE_FLOWS.map((flow) => flow.id)).toEqual([
      "baseline",
      "contract-red-green",
      "analyze",
      "test",
      "validation",
      "lethal-trifecta",
    ]);
  });
});
