type LevelNode = { level: string };
type StatusNode = { status?: string | null; manual_status?: string | null };

export interface InspectorProgress {
  label: "RUN" | "TASK" | "REQ";
  done: number;
  total: number;
}

/** 계층마다 사람이 기대하는 실제 실행 단위로 진행률을 표현한다. */
export function inspectorProgress(node: LevelNode, items: StatusNode[]): InspectorProgress {
  const label = node.level === "spec" ? "RUN" : node.level === "workstream" ? "TASK" : "REQ";
  return {
    label,
    done: items.filter((item) => (item.manual_status ?? item.status ?? "pending").toLowerCase() === "done").length,
    total: items.length,
  };
}
