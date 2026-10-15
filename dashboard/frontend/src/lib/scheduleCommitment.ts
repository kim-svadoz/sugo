import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import type { CommitmentState, CommitmentTarget, ScheduleCommitment } from "../api/scheduleCommitmentApi.js";

export type CommitmentPipelineStatus = "not_started" | "running" | "blocked" | "done";
export type DeploymentEnvironment = "UNKNOWN" | "LOCAL" | "DEV" | "STG" | "PRD";

/** API의 명시적 약속에 현재 관측된 실행·배포 사실을 합성한 화면 projection이다. */
export type CommitmentProjection = ScheduleCommitment & {
  pipeline_status?: CommitmentPipelineStatus | string;
  current_environment?: DeploymentEnvironment | null;
};
export type CommitmentView = CommitmentProjection;

export type CommitmentQueueGroupId = "overdue" | "today" | "next" | "later" | "inbox";

export interface CommitmentQueueGroup<T extends ScheduleCommitment> {
  id: CommitmentQueueGroupId;
  label: string;
  description: string;
  items: T[];
}

export interface CommitmentNextAction { label: string; detail: string }

const environmentRank: Record<DeploymentEnvironment, number> = { UNKNOWN: -1, LOCAL: 0, DEV: 1, STG: 2, PRD: 3 };

const targetEnvironment = (target: CommitmentTarget): DeploymentEnvironment | null => {
  if (target === "dev" || target === "stg" || target === "prd") return target.toUpperCase() as DeploymentEnvironment;
  return null;
};

export function isOpenCommitment(commitment: Pick<ScheduleCommitment, "state">): boolean {
  return commitment.state === "planned" || commitment.state === "active";
}

/**
 * 파이프라인 완료는 실행 증거일 뿐 일정 약속을 닫지 않는다.
 * 약속은 state가 completed/cancelled로 명시적으로 바뀔 때만 종료된다.
 */
export function commitmentNextAction(commitment: CommitmentProjection): CommitmentNextAction {
  if (!isOpenCommitment(commitment)) {
    return {
      label: commitment.state === "completed" ? "완료된 일정" : "취소된 일정",
      detail: "활성 실행 대기열에서 제외됩니다.",
    };
  }
  if (commitment.pipeline_status === "blocked") return { label: "차단 원인 해결", detail: "결정 또는 외부 입력이 필요합니다." };
  if (!commitment.pipeline_status || commitment.pipeline_status === "not_started") return { label: "개발 시작", detail: "아직 시작된 파이프라인이 없습니다." };
  if (commitment.pipeline_status === "running") return { label: "진행 상태 확인", detail: "연결된 파이프라인이 실행 중입니다." };

  const target = targetEnvironment(commitment.target);
  if (target) {
    const current = commitment.current_environment ?? "LOCAL";
    if (environmentRank[current] < environmentRank[target]) {
      return { label: `${target} 배포`, detail: `현재 ${current} · ${target} 반영 후 자동으로 다음 단계가 표시됩니다.` };
    }
    return { label: "일정 닫기", detail: `목표 ${target}까지 반영되었습니다. 이 마감 일정을 Agenda에서 닫을 수 있습니다.` };
  }
  if (commitment.target === "review") return { label: "리뷰 진행", detail: "개발 파이프라인이 완료되었습니다." };
  return {
    label: "일정 닫기",
    detail: commitment.target === "custom" ? "정해 둔 완료 조건을 확인했습니다." : "개발 파이프라인이 완료되었습니다.",
  };
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function buildCommitmentQueue<T extends ScheduleCommitment>(commitments: T[], todayKey: string): CommitmentQueueGroup<T>[] {
  const nextWeekKey = addDays(todayKey, 7);
  const open = commitments.filter(isOpenCommitment);
  const dated = open
    .filter((item): item is T & { due_date: string } => item.due_date !== null)
    .sort((left, right) => left.due_date.localeCompare(right.due_date));
  const inbox = open.filter((item) => item.due_date === null);
  const definitions: Array<Omit<CommitmentQueueGroup<T>, "items"> & { match: (item: T & { due_date: string }) => boolean }> = [
    { id: "overdue", label: "지난 일정 · 미종료", description: "마감일은 지났지만 종료하지 않은 SPEC", match: (item) => item.due_date < todayKey },
    { id: "today", label: "오늘", description: "오늘까지 마감", match: (item) => item.due_date === todayKey },
    { id: "next", label: "다음 7일", description: "7일 안에 마감", match: (item) => item.due_date > todayKey && item.due_date <= nextWeekKey },
    { id: "later", label: "이후 일정", description: "7일 이후 마감", match: (item) => item.due_date > nextWeekKey },
  ];
  const groups: CommitmentQueueGroup<T>[] = definitions.flatMap((definition) => {
    const items = dated.filter(definition.match);
    return items.length > 0 ? [{ id: definition.id, label: definition.label, description: definition.description, items }] : [];
  });
  if (inbox.length > 0) groups.push({ id: "inbox", label: "날짜 미정", description: "날짜를 정해야 할 작업", items: inbox });
  return groups;
}

type LegacySpec = Pick<ScheduledSpec, "id" | "workspace_name" | "title" | "due_date" | "status" | "has_run">;

/**
 * 전환 기간에는 기존 Spec 일정을 활성 Commitment로 투영한다.
 * Spec/Task의 done은 pipeline_status만 채우며 약속 state를 completed로 바꾸지 않는다.
 */
export function legacyCommitments(specs: LegacySpec[]): CommitmentProjection[] {
  return specs.map((spec) => ({
    id: `legacy:${spec.workspace_name}:${spec.id}`,
    spec_id: spec.id,
    workspace_name: spec.workspace_name,
    title: spec.title,
    due_date: spec.due_date,
    state: "active" as CommitmentState,
    target: "implementation",
    linked_run_id: null,
    completed_at: null,
    completed_by: null,
    created_at: "",
    updated_at: "",
    pipeline_status: spec.status === "done" ? "done" : spec.has_run ? "running" : "not_started",
    current_environment: null,
  }));
}
