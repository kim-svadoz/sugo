import { apiJson } from "./client.js";

export interface HarnessFeatureState { enabled: boolean; projectCount?: number }

export function getHarnessFeature(): Promise<HarnessFeatureState> {
  return apiJson<HarnessFeatureState>("/api/harness-feature");
}

export function setHarnessFeature(enabled: boolean): Promise<HarnessFeatureState> {
  return apiJson<HarnessFeatureState>("/api/harness-feature", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}
