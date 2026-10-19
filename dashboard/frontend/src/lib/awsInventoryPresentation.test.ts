import { describe, expect, it } from "vitest";
import { summarizeSageMaker } from "./awsInventoryPresentation.js";

describe("summarizeSageMaker", () => {
  it("prioritizes inference endpoints and reduces versioned resources to counts", () => {
    const summary = summarizeSageMaker([
      { service: "sagemaker", kind: "endpoint", id: "api-endpoint", metadata: { status: "InService" } },
      { service: "sagemaker", kind: "endpoint-config", id: "api-endpoint-v2-config" },
      { service: "sagemaker", kind: "endpoint-config", id: "api-endpoint-v1-config" },
      { service: "sagemaker", kind: "model", id: "api-endpoint-v2" },
    ]);

    expect(summary).toEqual({
      endpoints: [{ id: "api-endpoint", status: "InService" }],
      endpointCount: 1,
      endpointConfigCount: 2,
      modelCount: 1,
      notebookCount: 0,
    });
  });

  it("keeps an environment visible even when it has only configs and models", () => {
    expect(summarizeSageMaker([
      { service: "sagemaker", kind: "endpoint-config", id: "dev-config" },
      { service: "sagemaker", kind: "model", id: "dev-model" },
    ])).toMatchObject({ endpoints: [], endpointCount: 0, endpointConfigCount: 1, modelCount: 1 });
  });
});
