import { apiJson } from "./client.js";

export type PrScope = "task" | "run" | "spec";

export interface PrRef {
  id: number;
  url: string;
}

export interface PrExistingResponse {
  exists: boolean;
  pr?: PrRef;
  error?: string;
}

export interface PrCreateResponse {
  pr?: PrRef;
  existed?: boolean;
  error?: string;
}

// §3.4/§6: AUTH-gated (Bearer) - apiFetch/apiJson already attach the token.
export function checkExistingPr(input: { workspace: string; nodeId: string; scope: PrScope; targetBranch?: string }) {
  return apiJson<PrExistingResponse>("/api/pr/existing", { method: "POST", body: JSON.stringify(input) });
}

export function createPr(input: {
  workspace: string;
  nodeId: string;
  scope: PrScope;
  title?: string;
  description?: string;
  targetBranch?: string;
}) {
  return apiJson<PrCreateResponse>("/api/pr/create", { method: "POST", body: JSON.stringify(input) });
}
