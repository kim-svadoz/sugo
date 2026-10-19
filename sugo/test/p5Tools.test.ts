import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoPrd } from "../src/tools/sugoPrd.js";
import { handleSugoSetup } from "../src/tools/sugoSetup.js";
import { handleSugoCommit } from "../src/tools/sugoCommit.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";

async function call(handler: (a: unknown) => Promise<unknown>, args?: unknown) {
  const res = (await handler(args)) as { isError?: boolean; content: { text: string }[] };
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-p5-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-p5-proj-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});
afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("sugo_prd — DEPRECATED 거부 스텁", () => {
  it("무조건 거부하고 대체 경로를 알려준다", async () => {
    const r = await call(handleSugoPrd as never);
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("TOOL_DEPRECATED");
    expect(r.data.replacement).toBe("sugo_plan(action:'prd')");
  });
});

describe("sugo_setup — 저장하지 않고 안내만", () => {
  it("설정한 척하지 않는다(configured:false)", async () => {
    const r = await call(handleSugoSetup as never, { bitbucket: { baseUrl: "https://bb.example.com" } });
    expect(r.isError).toBe(false);
    expect(r.data.configured).toBe(false);
    expect(r.data.received.bitbucket.baseUrl).toBe("https://bb.example.com");
    expect(r.data.note).toContain("대시보드");
  });

  it("인자 없이도 동작한다", async () => {
    expect((await call(handleSugoSetup as never, {})).isError).toBe(false);
  });
});

/**
 * sugo_commit은 **메시지 생성만** 한다. 저장소를 바꾸는 건 사람 몫이라 실행하지 않고,
 * DONE이 아닌 세션엔 메시지조차 만들어주지 않는다 — 게이트를 건너뛴 기록의 뒷문을 막는다.
 */
describe("sugo_commit — DONE 전용 · 생성만", () => {
  async function sessionAt(done: boolean): Promise<string> {
    const start = await call(handleSugoPlan as never, { action: "start", projectPath: projectDir, featureName: "f" });
    const sessionId = start.data.sessionId as string;
    if (!done) return sessionId;
    const prd = "REQ-1: 로그인 기능을 제공한다. " + "가".repeat(90);
    await call(handleSugoPlan as never, { action: "clarify", sessionId });
    await call(handleSugoPlan as never, { action: "prd", sessionId, prdContent: prd });
    await call(handleSugoPlan as never, { action: "ready", sessionId });
    await call(handleSugoPlan as never, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan as never, { action: "contract_start", sessionId });
    await call(handleSugoPlan as never, { action: "contract_done", sessionId });
    await call(handleSugoPlan as never, { action: "code_start", sessionId });
    return sessionId;
  }

  it("거부: DONE이 아닌 세션", async () => {
    const sessionId = await sessionAt(false);
    const r = await call(handleSugoCommit as never, { sessionId, type: "feat", subject: "로그인 추가" });
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("COMMIT_REQUIRES_DONE");
  });

  it("거부: 없는 세션", async () => {
    const r = await call(handleSugoCommit as never, { sessionId: "nope", type: "feat", subject: "x" });
    expect(r.data.errorCode).toBe("SESSION_NOT_FOUND");
  });

  it("파이프라인 중간 상태에서도 메시지를 만들어주지 않는다(뒷문 차단)", async () => {
    const sessionId = await sessionAt(true); // CODE_RUNNING까지만 진행
    const r = await call(handleSugoCommit as never, { sessionId, type: "feat", subject: "로그인 추가" });
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("COMMIT_REQUIRES_DONE");
  });
});
