import { apiJson } from "./client.js";

/** Preferences › 외부 연동에서 켜고 끄는 기능. 꺼진 기능은 Integrations › 외부 서비스에서 설정 대신 안내를 보여 준다. */
export interface IntegrationFeatures {
  aws: boolean;
  pr: boolean;
  apm: boolean;
}

export const INTEGRATION_FEATURES_OFF: IntegrationFeatures = { aws: false, pr: false, apm: false };

export function getIntegrationFeatures(): Promise<IntegrationFeatures> {
  return apiJson<IntegrationFeatures>("/api/integration-features");
}

export function saveIntegrationFeatures(features: IntegrationFeatures): Promise<IntegrationFeatures> {
  return apiJson<IntegrationFeatures>("/api/integration-features", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(features) });
}
