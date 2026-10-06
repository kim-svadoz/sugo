export interface SpecDeployment {
  environment: "LOCAL" | "DEV" | "STG" | "PRD" | "UNKNOWN";
  partial: boolean;
  total: number;
  reason?: string;
  stale?: boolean;
  sources?: { taskId: string; project: string | null; commit: string | null; state: string; patchVersion?: number; recoveredFrom?: string }[];
  environments: { environment: string; included: number; total: number; unknown: boolean; services: {
    project: string; service: string; account: string; observedAt: string | null; images: string[]; commits: string[]; state: "confirmed" | "unknown"; reason?: string;
  }[] }[];
}
