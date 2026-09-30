import { describe, expect, it } from "vitest";
import { initialIntegrationSelection, integrationStatusLabel } from "./projectIntegrationPresentation.js";
import { awsAccountOptionLabel, awsAccountMetaLabel, moveIntegrationKeys, partitionIntegrationCandidates } from "./projectIntegrationPresentation.js";

const candidates = [
  { accountName: "team-dev", environment: "dev", service: "orders-api-service", cluster: "shop", images: ["repo/orders-api:1"], pinpointApplicationName: null },
  { accountName: "default", environment: "default", service: "unrelated", cluster: "misc", images: ["repo/unrelated:1"], pinpointApplicationName: null },
];
const key = (item: { accountName: string; service: string; cluster?: string | null }) => `${item.accountName}\u0000${item.cluster ?? ""}\u0000${item.service}`;

describe("project integration presentation", () => {
  it("separates the account identity from non-duplicated profile metadata", () => {
    const account = { name: "team-prd", profile: "team-prd", region: "ap-northeast-2", accountHint: "1234", principal: "demo-user" };
    expect(awsAccountOptionLabel(account)).toBe("team-prd · ••••1234");
    expect(awsAccountMetaLabel(account)).toBe("profile team-prd · ap-northeast-2 · demo-user");
  });

  it("preselects exact recommendations for an unconfigured local project", () => {
    expect(initialIntegrationSelection({ workspace_name: "shop", project_path: "/work/orders-api", configured: false, selections: [] }, candidates, key)).toEqual([key(candidates[0])]);
  });

  it("preserves explicit saved selections instead of recalculating recommendations", () => {
    const saved = { accountName: "default", environment: "default", service: "unrelated", cluster: "misc" };
    expect(initialIntegrationSelection({ workspace_name: "shop", project_path: "/work/orders-api", configured: true, selections: [saved] }, candidates, key)).toEqual([key(saved)]);
  });

  it("distinguishes workspace registration from confirmed infrastructure mapping", () => {
    expect(integrationStatusLabel({ configured: false, selections: [] })).toBe("AWS/APM 미확정");
    expect(integrationStatusLabel({ configured: true, selections: [candidates[0]] })).toBe("AWS/APM 1개 확정");
    expect(integrationStatusLabel({ configured: true, selections: [] })).toBe("외부 연동 사용 안 함");
  });

  it("partitions candidates into available and pending/confirmed columns", () => {
    const selected = [key(candidates[0])];
    expect(partitionIntegrationCandidates(candidates, selected, key)).toEqual({ available: [candidates[1]], applied: [candidates[0]] });
  });

  it("moves only checked rows across columns without duplicates", () => {
    const first = key(candidates[0]);
    const second = key(candidates[1]);
    expect(moveIntegrationKeys([first], [second], "add")).toEqual([first, second]);
    expect(moveIntegrationKeys([first, second], [first], "remove")).toEqual([second]);
  });
});
