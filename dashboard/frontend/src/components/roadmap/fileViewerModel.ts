import { parseWorkResult, type RoadmapNode, type WorkResultFile } from "../../hooks/useRoadmap.js";

export type FileViewerKind = "code" | "test" | "config" | "document" | "data" | "style" | "plain";

export interface FileViewerPresentation {
  kind: FileViewerKind;
  eyebrow: string;
  description: string;
  tone: "cyan" | "violet" | "amber" | "emerald" | "sky" | "rose" | "slate";
}

/**
 * SPEC/RUN은 PR scope와 마찬가지로 하위 작업 전체를 뜻한다. 컨테이너 자체에 work_result가
 * 없어도 자손의 산출물을 모아야 파일 탭이 비지 않는다. 같은 파일이 여러 차수에서 바뀌면
 * 로드맵 배열의 뒤쪽(최신 sync)에 있는 결과를 남긴다.
 */
export function filesForRoadmapScope(selected: RoadmapNode, nodes: RoadmapNode[]): WorkResultFile[] {
  const scopeIds = new Set<string>([selected.id]);
  if (selected.level === "spec" || selected.level === "workstream") {
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of nodes) {
        if (!node.parent || !scopeIds.has(node.parent) || scopeIds.has(node.id)) continue;
        scopeIds.add(node.id);
        grew = true;
      }
    }
  }

  const latestByPath = new Map<string, WorkResultFile>();
  const candidates = nodes.some((node) => node.id === selected.id) ? nodes : [...nodes, selected];
  for (const node of candidates) {
    if (!scopeIds.has(node.id)) continue;
    for (const file of parseWorkResult(node.work_result)?.files ?? []) {
      latestByPath.delete(file.path);
      latestByPath.set(file.path, file);
    }
  }
  return [...latestByPath.values()];
}

export function fileViewerText(file: WorkResultFile): string {
  if (file.diff?.trim()) return file.diff;
  if (file.content?.trim()) return file.content;
  if (file.unavailableReason) return `${file.path}\n\n${file.unavailableReason}`;
  return `${file.path}\n\n이 작업 결과에는 저장된 diff/content가 없습니다.`;
}

export function fileViewerLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const aliases: Record<string, string> = { yml: "YAML", yaml: "YAML", js: "JS", jsx: "JSX", ts: "TS", tsx: "TSX", md: "MD", java: "JAVA", kt: "KOTLIN", py: "PYTHON", json: "JSON" };
  return aliases[ext] ?? (ext ? ext.toUpperCase() : "TEXT");
}

export function fileViewerPresentation(path: string): FileViewerPresentation {
  const normalized = path.toLowerCase();
  const name = normalized.split("/").pop() ?? normalized;
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const isTest = /(^|[/_.-])(test|tests|spec|specs)([/_.-]|$)/.test(normalized)
    || /(?:test|tests|spec)\.[^.]+$/.test(name);
  if (isTest) return { kind: "test", eyebrow: "검증 코드", description: "동작을 증명하는 테스트 소스", tone: "emerald" };
  if (["java", "kt", "kts", "js", "jsx", "ts", "tsx", "py", "go", "rs", "rb", "php", "swift", "c", "cc", "cpp", "h", "hpp"].includes(ext)) {
    return { kind: "code", eyebrow: "소스 코드", description: "구현 파일 전체 내용", tone: "cyan" };
  }
  if (["yml", "yaml", "json", "toml", "ini", "conf", "config", "properties", "env", "xml"].includes(ext)
    || ["dockerfile", "makefile", "gradle", "pom.xml"].includes(name)) {
    return { kind: "config", eyebrow: "구성 파일", description: "빌드·런타임 설정 원문", tone: "amber" };
  }
  if (["md", "mdx", "rst", "adoc", "txt"].includes(ext) || /^readme(?:\.|$)/.test(name)) {
    return { kind: "document", eyebrow: "문서", description: "문서 마크업 원문", tone: "violet" };
  }
  if (["sql", "graphql", "gql", "csv", "tsv"].includes(ext)) {
    return { kind: "data", eyebrow: "데이터·스키마", description: "쿼리 및 구조 정의 원문", tone: "sky" };
  }
  if (["css", "scss", "sass", "less", "styl"].includes(ext)) {
    return { kind: "style", eyebrow: "스타일", description: "화면 스타일 원문", tone: "rose" };
  }
  return { kind: "plain", eyebrow: "파일", description: "저장된 파일 전체 내용", tone: "slate" };
}
