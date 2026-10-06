import { workflowStatus } from "../../lib/workflowStatus.js";
type LevelNode = { level: string };
type StatusNode = { display_status?: string; level?: string; work_result?: unknown; status?: string | null; manual_status?: string | null };

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
    done: items.filter((item) => workflowStatus(item) === "done").length,
    total: items.length,
  };
}
