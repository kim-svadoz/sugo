import { describe, expect, it } from "vitest";
import { checkLethalTrifecta, type ToolCapabilityProfile } from "../src/lethalTrifecta.js";

describe("checkLethalTrifecta — 반드시 경고", () => {
  it("3축(사설접근+신뢰불가입력+외부통신)이 모두 있으면 경고한다", () => {
    const tools: ToolCapabilityProfile[] = [
      { toolName: "web-fetch-and-read-secrets", accessesPrivateData: true, processesUntrustedInput: true, communicatesExternally: true },
    ];
    const warnings = checkLethalTrifecta(tools);
    expect(warnings.length).toBe(1);
    expect(warnings[0].toolName).toBe("web-fetch-and-read-secrets");
  });
});

describe("checkLethalTrifecta — 반드시 경고 없음(2축 이하)", () => {
  it("사설접근+신뢰불가입력만 있고 외부통신이 없으면 경고 없음", () => {
    const tools: ToolCapabilityProfile[] = [
      { toolName: "local-file-parser", accessesPrivateData: true, processesUntrustedInput: true, communicatesExternally: false },
    ];
    expect(checkLethalTrifecta(tools)).toEqual([]);
  });

  it("외부통신+신뢰불가입력만 있고 사설접근이 없으면 경고 없음", () => {
    const tools: ToolCapabilityProfile[] = [
      { toolName: "public-api-proxy", accessesPrivateData: false, processesUntrustedInput: true, communicatesExternally: true },
    ];
    expect(checkLethalTrifecta(tools)).toEqual([]);
  });

  it("아무 capability도 없으면 경고 없음", () => {
    const tools: ToolCapabilityProfile[] = [
      { toolName: "pure-calculator", accessesPrivateData: false, processesUntrustedInput: false, communicatesExternally: false },
    ];
    expect(checkLethalTrifecta(tools)).toEqual([]);
  });

  it("여러 도구 중 3축을 만족하는 것만 골라 경고한다", () => {
    const tools: ToolCapabilityProfile[] = [
      { toolName: "safe-tool", accessesPrivateData: true, processesUntrustedInput: false, communicatesExternally: true },
      { toolName: "risky-tool", accessesPrivateData: true, processesUntrustedInput: true, communicatesExternally: true },
    ];
    const warnings = checkLethalTrifecta(tools);
    expect(warnings.map((w) => w.toolName)).toEqual(["risky-tool"]);
  });
});
