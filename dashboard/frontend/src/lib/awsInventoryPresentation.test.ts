import { describe, expect, it } from "vitest";
import { summarizeSageMaker } from "./awsInventoryPresentation.js";

describe("summarizeSageMaker", () => {
  it("prioritizes serving endpoints and reduces versioned resources to counts", () => {
    const summary = summarizeSageMaker([
      { service: "sagemaker", kind: "endpoint", id: "ranker", metadata: { status: "InService" } },
      { service: "sagemaker", kind: "endpoint-config", id: "ranker-v2-config" },
      { service: "sagemaker", kind: "endpoint-config", id: "ranker-v1-config" },
      { service: "sagemaker", kind: "model", id: "ranker-v2" },
    ]);

    expect(summary).toEqual({
      endpoints: [{ id: "ranker", status: "InService" }],
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
