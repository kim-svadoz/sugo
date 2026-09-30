import type { AwsInventoryResource } from "../api/awsContextApi.js";

export function summarizeSageMaker(resources: AwsInventoryResource[]) {
  const byKind = (kind: string) => resources.filter((resource) => resource.kind === kind);
  const endpoints = byKind("endpoint").map((resource) => ({
    id: resource.id,
    status: typeof resource.metadata?.status === "string" ? resource.metadata.status : null,
  }));
  return {
    endpoints,
    endpointCount: endpoints.length,
    endpointConfigCount: byKind("endpoint-config").length,
    modelCount: byKind("model").length,
    notebookCount: byKind("notebook-instance").length,
  };
}
