import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";

async function call(handler: (a: unknown) => Promise<unknown>, args?: unknown) {
  const res = (await handler(args)) as { isError?: boolean; content: { text: string }[] };
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-trifecta-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-trifecta-proj-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});
afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("handleSugoCheckLethalTrifecta — §P6-1 세션 기록", () => {
  it("존재하지 않는 세션이면 SESSION_NOT_FOUND로 거부한다", async () => {
    const result = await call(handleSugoCheckLethalTrifecta, { sessionId: "no-such-session", tools: [] });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("SESSION_NOT_FOUND");
  });

  it("경고가 없으면 safe:true를 돌려주고 review_done이 볼 호출기록을 남긴다", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "demo" });
    const sessionId = start.data.sessionId as string;

    const result = await call(handleSugoCheckLethalTrifecta, {
      sessionId,
      tools: [{ toolName: "pure-calculator", accessesPrivateData: false, processesUntrustedInput: false, communicatesExternally: false }],
    });
    expect(result.isError).toBe(false);
    expect(result.data.safe).toBe(true);
    expect(result.data.warnings).toEqual([]);
  });

  it("3축 동시 성립 도구가 있으면 경고를 돌려준다(호출자 판정 그대로, 추측하지 않음)", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "demo" });
    const sessionId = start.data.sessionId as string;

    const result = await call(handleSugoCheckLethalTrifecta, {
      sessionId,
      tools: [
        { toolName: "web-fetch-and-read-secrets", accessesPrivateData: true, processesUntrustedInput: true, communicatesExternally: true },
      ],
    });
    expect(result.isError).toBe(false);
    expect(result.data.safe).toBe(false);
    expect(result.data.warnings).toHaveLength(1);
    expect(result.data.warnings[0].toolName).toBe("web-fetch-and-read-secrets");
  });

  it("같은 세션에 두 번 호출하면 최신 호출로 기록이 갱신된다(누적이 아니라 대체)", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "demo" });
    const sessionId = start.data.sessionId as string;

    await call(handleSugoCheckLethalTrifecta, {
      sessionId,
      tools: [{ toolName: "risky", accessesPrivateData: true, processesUntrustedInput: true, communicatesExternally: true }],
    });
    const second = await call(handleSugoCheckLethalTrifecta, { sessionId, tools: [] });
    expect(second.data.safe).toBe(true);
    expect(second.data.warnings).toEqual([]);
  });
});
