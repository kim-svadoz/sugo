export interface SpecDeployment {
  environment: "LOCAL" | "DEV" | "STG" | "PRD" | "UNKNOWN";
  partial: boolean;
  total: number;
  reason?: string;
  stale?: boolean;
  sources?: { taskId: string; project: string | null; commit: string | null; state: string; patchVersion?: number; recoveredFrom?: string; summary?: string }[];
  environments: { environment: string; included: number; total: number; unknown: boolean; services: {
    project: string; service: string; account: string; observedAt: string | null; images: string[]; commits: string[]; state: "confirmed" | "unknown"; reason?: string;
  }[] }[];
}

export function deploymentInclusionLabel(env: { included: number; total: number; unknown: boolean }): string {
  if (env.total === 0) return "작업 없음";
  if (env.included >= env.total) return "포함";
  if (env.included > 0) return "일부 포함";
  return env.unknown ? "확인 중" : "미포함";
}
