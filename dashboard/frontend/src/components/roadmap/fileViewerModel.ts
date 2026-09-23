import type { WorkResultFile } from "../../hooks/useRoadmap.js";

export function fileViewerText(file: WorkResultFile): string {
  if (file.content?.trim()) return file.content;
  if (file.diff?.trim()) return file.diff;
  return `${file.path}\n\n이 작업 결과에는 저장된 diff/content가 없습니다.`;
}

export function fileViewerLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const aliases: Record<string, string> = { yml: "YAML", yaml: "YAML", js: "JS", jsx: "JSX", ts: "TS", tsx: "TSX", md: "MD", java: "JAVA", kt: "KOTLIN", py: "PYTHON", json: "JSON" };
  return aliases[ext] ?? (ext ? ext.toUpperCase() : "TEXT");
}
