import { apiJson } from "./client.js";

export interface ReferenceReader {
  id: string;
  urlPrefix: string;
  mcpServer: string;
}

export function getReferenceReaders(): Promise<{ readers: ReferenceReader[] }> {
  return apiJson("/api/reference-readers");
}

export function saveReferenceReaders(readers: ReferenceReader[]): Promise<{ readers: ReferenceReader[] }> {
  return apiJson("/api/reference-readers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readers }),
  });
}
