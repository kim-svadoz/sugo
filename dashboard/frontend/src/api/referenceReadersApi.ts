import { apiJson } from "./client.js";

export interface ReferenceReader {
  id: string;
  urlPrefix: string;
  mcpServer: string;
}

export interface WikiSetupStatus {
  registration: "complete" | "missing";
  authentication: "complete" | "required" | "unknown" | "blocked";
  clients: Array<"claude" | "codex">;
}

export function getReferenceReaders(): Promise<{ readers: ReferenceReader[]; setup: WikiSetupStatus }> {
  return apiJson("/api/reference-readers");
}

export function saveReferenceReaders(readers: ReferenceReader[]): Promise<{ readers: ReferenceReader[] }> {
  return apiJson("/api/reference-readers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readers }),
  });
}

export function previewReferenceReaders(readers: ReferenceReader[]): Promise<{ readers: ReferenceReader[]; changed: boolean }> {
  return apiJson("/api/reference-readers/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readers }),
  });
}

export function testReferenceReader(url: string, readers: ReferenceReader[]): Promise<{ match: ReferenceReader | null }> {
  return apiJson("/api/reference-readers/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, readers }),
  });
}
