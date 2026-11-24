import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import type { ActivityEvent } from "../hooks/useActivityStream.js";
import { parseActivityTime } from "./activityTime.js";
import { scheduleCardStage } from "./scheduleSpecWorkflow.js";
import { collectFloorLanes, type FloorLane } from "./workFloor.js";

export interface DomainFloorLane extends FloorLane {
  activityKey: string;
  spec?: ScheduledSpec;
  preparation?: "ready" | "starting";
}

export interface DomainFloorSelection {
  key: string;
  activityKey: string;
}

export function selectDomainLanes(events: readonly ActivityEvent[], specs: readonly ScheduledSpec[], workspace: string, now: number): DomainFloorLane[] {
  const scheduled = specs.filter((spec) => spec.workspace_name === workspace && spec.spec_path && spec.status !== "dropped");
  const specByTask = new Map<string, ScheduledSpec>();
  for (const spec of scheduled) {
    const taskIds = spec.task_ids ?? [spec.focus_task_id, ...(spec.development_history ?? []).map((entry) => entry.task_id)];
    for (const taskId of taskIds) if (taskId) specByTask.set(taskId, spec);
  }
  const specKey = (spec: ScheduledSpec) => `schedule:${spec.workspace_name}:${spec.id}`;
  const represented = new Set<string>();
  const lanes = collectFloorLanes(events.filter((event) => event.workspace_name === workspace), now).map((lane): DomainFloorLane => {
    const spec = lane.taskId ? specByTask.get(lane.taskId) : undefined;
    const activityKey = lane.key;
    if (!spec || represented.has(spec.id)) return { ...lane, activityKey, spec };
    represented.add(spec.id);
    return { ...lane, key: specKey(spec), activityKey, spec };
  });
  const preparing = scheduled.flatMap((spec): DomainFloorLane[] => {
    if (represented.has(spec.id)) return [];
    const stage = scheduleCardStage(spec);
    const preparation = stage === "ready" ? "ready" : spec.has_run && stage === "in_progress" ? "starting" : null;
    if (!preparation) return [];
    const key = specKey(spec);
    const at = spec.spec_written_at ? parseActivityTime(spec.spec_written_at).getTime() : undefined;
    return [{
      key,
      activityKey: key,
      name: spec.title,
      projectPath: spec.project_path ?? undefined,
      workspace,
      spec,
      preparation,
      state: { station: "order", activity: "resting", live: false, at, passed: [], lastAt: {} },
    }];
  }).sort((left, right) => (right.state.at ?? 0) - (left.state.at ?? 0));
  const live = lanes.filter((lane) => lane.state.live);
  const past = lanes.filter((lane) => !lane.state.live);
  const paused = past.filter((lane) => lane.spec?.status === "in_progress" && lane.state.activity === "paused");
  return [...live, ...preparing, ...(paused.length > 0 ? paused : live.length === 0 ? past.slice(0, 1) : [])];
}
