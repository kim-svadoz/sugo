type WorkspacePulseInput = {
  activeTaskCount?: number;
  attentionCount?: number;
  roadmapCount?: number;
  roadmapDoneCount?: number;
};

type SchedulePulseInput = { due_date: string | null; status: string };

export function workspacePulse(workspaces: readonly WorkspacePulseInput[]) {
  return workspaces.reduce(
    (pulse, workspace) => ({
      active: pulse.active + (workspace.activeTaskCount ?? 0),
      attention: pulse.attention + (workspace.attentionCount ?? 0),
      done: pulse.done + (workspace.roadmapDoneCount ?? 0),
      total: pulse.total + (workspace.roadmapCount ?? 0),
    }),
    { active: 0, attention: 0, done: 0, total: 0 },
  );
}

export function schedulePulse(specs: readonly SchedulePulseInput[], todayKey: string) {
  const start = new Date(`${todayKey}T00:00:00Z`);
  const weekEnd = new Date(start);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndKey = weekEnd.toISOString().slice(0, 10);

  return specs.reduce(
    (pulse, spec) => {
      if (!spec.due_date) {
        if (spec.status !== "done" && spec.status !== "dropped") pulse.unscheduled += 1;
        return pulse;
      }
      const open = spec.status !== "done" && spec.status !== "dropped";
      if (open && spec.due_date === todayKey) pulse.dueToday += 1;
      if (open && spec.due_date >= todayKey && spec.due_date <= weekEndKey) pulse.dueThisWeek += 1;
      if (open && spec.due_date < todayKey) pulse.overdue += 1;
      return pulse;
    },
    { dueToday: 0, dueThisWeek: 0, overdue: 0, unscheduled: 0 },
  );
}
