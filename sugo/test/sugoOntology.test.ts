import { describe, expect, it } from "vitest";
import { handleSugoOntology } from "../src/tools/sugoOntology.js";
import { ACTION_TYPES, WORKFLOW_STATES } from "../src/ontology/model.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(args: unknown): Promise<any> {
  const res = await handleSugoOntology(args);
  return JSON.parse(res.content[0].text);
}

describe("§2 sugo_ontology 도구", () => {
  it("인자 없이 부르면 전체 모델 + 파생 테이블을 준다", async () => {
    const r = await call({});
    expect(r.ok).toBe(true);
    expect(r.ontology.workflowStates).toEqual([...WORKFLOW_STATES]);
    expect(r.ontology.actionTypes).toHaveLength(ACTION_TYPES.length);
    // 파생 테이블을 같이 주는 게 핵심 — 선언만 주면 호출자가 파생 규칙을 각자 구현하게 된다.
    expect(r.derived.allowedActionsByState.PRD).toContain("oracle_done");
    expect(r.derived.prerequisites.ready).toEqual(["JIRA", "PRD"]);
    expect(r.derived.resultState.commit).toBe("DONE");
  });

  it("view로 섹션을 좁힐 수 있다", async () => {
    const r = await call({ view: "invariants" });
    expect(r.ok).toBe(true);
    expect(r.view).toBe("invariants");
    expect(r.invariants.map((i: { id: string }) => i.id)).toContain("no-fetch-bypass");
  });

  it("boundary는 계약 + 걸린 불변식 본문을 묶어서 준다", async () => {
    const r = await call({ boundary: "sync" });
    expect(r.ok).toBe(true);
    expect(r.boundary.name).toBe("sync");
    expect(r.boundary.contract).toContain("schemaVersion");
    const ids = r.boundary.invariants.map((i: { id: string }) => i.id);
    expect(ids).toContain("cross-repo-contract");
    expect(ids).toContain("ownership-preserved");
    // id만이 아니라 진술 본문까지 실려야 조회 한 번으로 쓸모가 있다.
    for (const inv of r.boundary.invariants) expect(inv.statement.length).toBeGreaterThan(0);
  });

  it("모르는 boundary는 조용히 빈 값이 아니라 사용 가능한 목록과 함께 거부한다", async () => {
    const r = await call({ boundary: "nope" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("UNKNOWN_BOUNDARY");
    expect(r.available).toEqual(["handoff", "sync", "lifecycle", "workflow"]);
  });

  it("모든 boundary가 조회 가능하다", async () => {
    for (const name of ["handoff", "sync", "lifecycle", "workflow"]) {
      const r = await call({ boundary: name });
      expect(r.ok, name).toBe(true);
      expect(r.boundary.invariants.length, name).toBeGreaterThan(0);
    }
  });
});
