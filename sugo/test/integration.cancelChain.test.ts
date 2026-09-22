import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CANCELLABLE_STATES, CHAIN_ABANDON_STATES } from "../src/ontology/model.js";
import { ALLOWED_ACTIONS_BY_STATE } from "../src/ontology/derive.js";
import { loadSession, saveSession } from "../src/session.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import type { PlanSession } from "../src/types.js";
import type { WorkflowState } from "../src/ontology/model.js";

/**
 * §9-A 체인 구간 취소. 런타임은 원래부터 어느 상태에서든 취소를 허용해 왔는데
 * (planStateMachine의 cancel 분기가 전제 검사보다 먼저 실행된다) 선언은 금지처럼 보였다.
 * 2026-09-22에 그 선언만 보고 "취소 불가"로 잘못 판단해 사용자가 세션 파일을 손으로 지웠다.
 */
let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-cancel-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

async function seed(state: WorkflowState): Promise<string> {
  const id = `plan-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  await saveSession({
    id, state, projectPath: fakeHome, featureName: "f",
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    data: { mode: "plan", chainInfo: { changedFiles: [], analyzeAttempts: 0, analyzePassed: null,
      testPassedState: null, reviewPassed: null, autoLoopRetryCount: 0 } },
  } as PlanSession);
  return id;
}

describe("§9-A 선언과 런타임이 일치한다", () => {
  it("체인 구간에서도 허용목록에 cancel이 있다", () => {
    for (const s of CHAIN_ABANDON_STATES) {
      expect(ALLOWED_ACTIONS_BY_STATE[s], s).toContain("cancel");
    }
  });

  it("두 집합은 겹치지 않는다 — 사유 필수 여부가 갈리는 경계다", () => {
    const clean = new Set<string>(CANCELLABLE_STATES);
    for (const s of CHAIN_ABANDON_STATES) expect(clean.has(s), s).toBe(false);
  });
});

describe("§9-A 체인 구간 취소는 사유를 요구한다", () => {
  it("사유 없이 취소하면 거부한다", async () => {
    const id = await seed("CODE_RUNNING");
    const r = parse(await handleSugoPlan({ action: "cancel", sessionId: id }));
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("CANCEL_REASON_REQUIRED");
    expect((await loadSession(id)).cancelledAt).toBeUndefined();
  });

  it("사유를 주면 취소되고 abandonedChain 라벨이 남는다", async () => {
    const id = await seed("CODE_RUNNING");
    const r = parse(await handleSugoPlan({ action: "cancel", sessionId: id, cancelReason: "요구사항이 폐기됨" }));
    expect(r.ok).toBe(true);
    const after = await loadSession(id);
    expect(after.cancelledAt).toBeTruthy();
    const labels = after.data.chainInfo.bypassLabels ?? [];
    expect(labels.map((l) => l.kind)).toContain("abandonedChain");
    expect(labels.find((l) => l.kind === "abandonedChain")?.reason).toBe("요구사항이 폐기됨");
  });

  it("체인 구간 5개 상태 전부 같은 규칙이다", async () => {
    for (const state of CHAIN_ABANDON_STATES) {
      const id = await seed(state);
      expect(parse(await handleSugoPlan({ action: "cancel", sessionId: id })).errorCode, state).toBe(
        "CANCEL_REASON_REQUIRED",
      );
    }
  });

  it("체인 밖(CODE_READY)은 사유 없이도 취소된다", async () => {
    const id = await seed("CODE_READY");
    expect(parse(await handleSugoPlan({ action: "cancel", sessionId: id })).ok).toBe(true);
    expect((await loadSession(id)).data.chainInfo.bypassLabels ?? []).toEqual([]);
  });
});

describe("§4.3-P completionPlan 노출", () => {
  it("status 응답에 남은 경로와 blocker가 실린다", async () => {
    const id = await seed("REVIEW_RUNNING");
    const r = parse(await handleSugoPlan({ action: "status", sessionId: id }));
    expect(r.completionPlan.remaining.map((s: { action: string }) => s.action)).toEqual([
      "review_done", "docs_done", "commit",
    ]);
  });
});
