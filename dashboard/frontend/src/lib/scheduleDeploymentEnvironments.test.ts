import { describe, expect, it } from "vitest";
import { scheduleDeploymentEnvironments } from "./scheduleDeploymentEnvironments.js";

describe("scheduleDeploymentEnvironments", () => {
  it("always includes LOCAL and only adds aliases configured for the project", () => {
    expect(scheduleDeploymentEnvironments([])).toEqual([{ key: "local", label: "LOCAL", reached: false }]);
    expect(scheduleDeploymentEnvironments([
      { accountName: "개발계", environment: "dev", service: "api" },
      { accountName: "개발계", environment: "dev", service: "worker" },
      { accountName: "운영계", environment: "prd", service: "api" },
    ])).toEqual([
      { key: "local", label: "LOCAL", reached: false },
      { key: "개발계", label: "개발계", reached: false },
      { key: "운영계", label: "운영계", reached: false },
    ]);
  });

  it("matches deployment evidence by stored environment while displaying the account alias", () => {
    const environments = scheduleDeploymentEnvironments(
      [{ accountName: "개발 AWS", environment: "dev", service: "api" }],
      { environment: "DEV", partial: false, total: 1, environments: [{ environment: "dev", included: 1, total: 1, unknown: false, services: [] }] },
    );
    expect(environments).toEqual([
      { key: "local", label: "LOCAL", reached: true },
      { key: "개발 AWS", label: "개발 AWS", reached: true },
    ]);
  });
});
