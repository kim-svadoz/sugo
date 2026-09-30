import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleSugoOntology } from "../src/tools/sugoOntology.js";
import { ACTION_TYPES, WORKFLOW_STATES } from "../src/ontology/model.js";
import { canonicalJson, deterministicModelHash } from "../src/ontology/identity.js";
import { saveSession } from "../src/session.js";
import type { PlanSession } from "../src/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(args: unknown): Promise<any> {
  const res = await handleSugoOntology(args);
  return JSON.parse(res.content[0].text);
}

describe("§2 sugo_ontology 도구", () => {
  it("모든 조회 응답이 같은 버전·revision·결정적 모델 해시를 제공한다", async () => {
    const responses = await Promise.all([
      call({}),
      call({ view: "invariants" }),
      call({ boundary: "sync" }),
      call({ boundary: "workflow" }),
    ]);

    const identities = responses.map((response) => response.model);
    for (const identity of identities) {
      expect(identity).toEqual({
        schemaVersion: 1,
        revision: 3,
        hashAlgorithm: "sha256",
        modelHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      });
    }
    expect(new Set(identities.map((identity) => identity.modelHash)).size).toBe(1);
    for (const response of responses) expect(response).not.toHaveProperty("generatedAt");
  });

  it("동일 프로세스에서 반복 조회해도 모델 해시는 시간과 무관하게 동일하다", async () => {
    const first = await call({});
    const second = await call({});
    expect(first.model.modelHash).toBe(second.model.modelHash);
  });

  it("결정적 해시는 객체 key 순서와 무관하고 배열 순서는 구분한다", () => {
    expect(deterministicModelHash({ b: 2, a: { y: 2, x: 1 } })).toBe(
      deterministicModelHash({ a: { x: 1, y: 2 }, b: 2 }),
    );
    expect(deterministicModelHash({ values: ["a", "b"] })).not.toBe(deterministicModelHash({ values: ["b", "a"] }));
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("인자 없이 부르면 전체 모델 + 파생 테이블을 준다", async () => {
    const r = await call({});
    expect(r.ok).toBe(true);
    expect(r.ontology.workflowStates).toEqual([...WORKFLOW_STATES]);
    expect(r.ontology.actionTypes).toHaveLength(ACTION_TYPES.length);
    // 파생 테이블을 같이 주는 게 핵심 — 선언만 주면 호출자가 파생 규칙을 각자 구현하게 된다.
    expect(r.derived.allowedActionsByState.PRD).toContain("oracle_done");
    expect(r.derived.prerequisites.ready).toEqual(["JIRA", "PRD"]);
    expect(r.derived.resultState.commit).toBe("DONE");
    expect(r.derived.workflowGraph).toMatchObject({
      unreachableFromInit: [],
      cannotReachDone: [],
      unexpectedCycles: [],
      staleCycleDeclarations: [],
    });
  });

  it("view로 섹션을 좁힐 수 있다", async () => {
    const r = await call({ view: "invariants" });
    expect(r.ok).toBe(true);
    expect(r.view).toBe("invariants");
    expect(r.invariants.map((i: { id: string }) => i.id)).toContain("no-fetch-bypass");
  });

  it("P1 실행 객체와 관계를 도구에서 그대로 조회할 수 있다", async () => {
    const objects = await call({ view: "objectTypes" });
    expect(objects.objectTypes.filter((object: { layer: string }) => object.layer === "runtime").map((object: { name: string }) => object.name))
      .toEqual(["session", "evidence", "human_decision", "artifact"]);

    const links = await call({ view: "linkTypes" });
    expect(links.linkTypes).toContainEqual(expect.objectContaining({ name: "operates_on", from: "session", to: "task" }));
    expect(links.linkTypes).toContainEqual(expect.objectContaining({ name: "resumes_at", from: "human_decision", to: "action" }));
  });

  it("sessionId 조회는 저장된 세션을 실제 runtime projection으로 반환한다", async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "sugo-ontology-runtime-"));
    process.env.SUGO_HOME_OVERRIDE = fakeHome;
    try {
      const session = {
        id: "plan-1-abcd",
        state: "SCAN",
        projectPath: "/project",
        featureName: "runtime projection",
        startedAt: "2026-09-30T00:00:00.000Z",
        updatedAt: "2026-09-30T00:00:00.000Z",
        data: {
          mode: "plan",
          chainInfo: { changedFiles: [], analyzeAttempts: 0, analyzePassed: null, testPassedState: null, reviewPassed: null, autoLoopRetryCount: 0 },
        },
      } satisfies PlanSession;
      await saveSession(session);
      const result = await call({ sessionId: session.id });
      expect(result.ok).toBe(true);
      expect(result.projection.sessionId).toBe(session.id);
      expect(result.projection.objects).toContainEqual(expect.objectContaining({ type: "session" }));
      expect(result.projection.diagnostics).toContainEqual(expect.objectContaining({ code: "TASK_LINK_UNAVAILABLE" }));
    } finally {
      delete process.env.SUGO_HOME_OVERRIDE;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("없는 세션과 여러 selector를 섞은 모호한 조회를 명시적으로 거부한다", async () => {
    const missing = await call({ sessionId: "plan-999-deadbeef" });
    expect(missing).toMatchObject({ ok: false, errorCode: "SESSION_NOT_FOUND" });

    const ambiguous = await call({ view: "invariants", boundary: "sync" });
    expect(ambiguous).toMatchObject({ ok: false, errorCode: "AMBIGUOUS_ONTOLOGY_QUERY" });
  });

  it("actionTypes 조회가 실제 게이트 위치와 근거를 제공한다", async () => {
    const r = await call({ view: "actionTypes" });
    const ready = r.actionTypes.find((action: { name: string }) => action.name === "ready");
    expect(ready.gates).toContainEqual(
      expect.objectContaining({
        gateId: "SPEC_ORACLE_NOT_RUN",
        checkedOnAction: "ready",
        evidenceSource: expect.any(String),
        enforcement: "hard",
      }),
    );
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
