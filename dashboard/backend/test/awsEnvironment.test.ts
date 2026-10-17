import { describe, expect, it } from "vitest";
import { environmentOfAccount } from "../src/services/awsEnvironment.js";

describe("environmentOfAccount", () => {
  it.each([
    ["team-dev", "dev"],
    ["team-dev", "dev"],
    ["shop_stage", "stg"],
    ["Production Account", "prd"],
    ["prd", "prd"],
  ])("%s 계정은 %s 환경이다", (accountName, environment) => {
    expect(environmentOfAccount(accountName)).toBe(environment);
  });

  it("환경 이름이 없거나 여럿이면 표시 이름을 그대로 쓴다", () => {
    expect(environmentOfAccount("default")).toBe("default");
    expect(environmentOfAccount("dev-to-prd-bridge")).toBe("dev-to-prd-bridge");
  });
});
