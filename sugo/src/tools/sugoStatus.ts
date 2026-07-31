import { z } from "zod";
import { drainRetryQueue } from "../dashboard/client.js";
import { resolveDashboardConfig } from "../dashboard/config.js";
import { listRetryQueue } from "../dashboard/retryQueue.js";
import { loadProjectConfig } from "../harness/config.js";
import { loadRegistry } from "../harness/registry.js";
import { computeJudgmentReport } from "../judgment.js";
import { loadAllSessions } from "../session.js";
import { isWorkEnabled } from "../work/enabled.js";

export const sugoStatusInputSchema = {
  health: z.boolean().optional().describe("대시보드 연결 상태·재시도 큐 크기를 함께 반환한다"),
  judgment: z.boolean().optional().describe("§5.8 판단품질 리포트를 함께 반환한다"),
  days: z.number().optional().describe("judgment: 최근 N일 이내 갱신된 세션만 집계(생략 시 전체)"),
  projectPath: z.string().optional().describe("이 경로의 프로젝트 하나만 조회한다"),
};

const SugoStatusArgs = z.object(sugoStatusInputSchema);

/**
 * §1 `sugo_status` — 상태 대시보드 **+ 진단 흡수**.
 *
 * v2에서 `sugo_hulk`가 완전히 사라지면서 그 도구가 갖고 있던 `health`(대시보드 연결 진단)와
 * `judgment`(§5.8 판단품질 리포트)가 여기로 들어왔다. 별도 umbrella 도구를 두면 "상태를 보려면
 * 어느 도구를 불러야 하나"가 매번 헷갈리고, 실제로 v1의 `sugo_hulk`는 enable/disable처럼
 * 아무 것도 안 하는 no-op 액션까지 달고 있었다.
 *
 * 기본(파라미터 없음)은 v1과 동일한 등록 프로젝트 목록이라 하위호환이 유지된다.
 */
export async function handleSugoStatus(rawArgs: unknown = {}) {
  const args = SugoStatusArgs.parse(rawArgs ?? {});

  const entries = await loadRegistry();
  const filtered = args.projectPath ? entries.filter((e) => e.path === args.projectPath) : entries;
  const projects = await Promise.all(
    filtered.map(async (entry) => {
      const config = await loadProjectConfig(entry.path);
      return {
        path: entry.path,
        name: entry.name,
        registeredAt: entry.registeredAt,
        workspace: entry.workspace,
        disabled: config?.disabled ?? false,
        appliedHarnessCount: config?.appliedHarnesses.length ?? 0,
        languages: config?.detectedStack.languages.map((l) => l.name) ?? [],
        frameworks: config?.detectedStack.frameworks.map((f) => f.name) ?? [],
        lastUpdated: config?.lastUpdated,
      };
    }),
  );

  const payload: Record<string, unknown> = {
    ok: true,
    totalProjects: projects.length,
    projects,
    workEnabled: isWorkEnabled(),
  };

  if (args.health) {
    const config = await resolveDashboardConfig();
    const queue = await listRetryQueue();
    // 진단을 부른 김에 큐를 한 바퀴 돌린다 — "쌓여 있다"만 알려주고 방치하면 진단의 의미가 없다.
    if (config.enabled) await drainRetryQueue();
    payload.health = {
      dashboardEnabled: config.enabled,
      dashboardApiUrl: config.enabled ? config.apiUrl : undefined,
      retryQueueSize: queue.length,
      retryQueueSizeAfterDrain: config.enabled ? (await listRetryQueue()).length : queue.length,
    };
  }

  if (args.judgment) {
    const allSessions = await loadAllSessions();
    const sessions =
      args.days === undefined
        ? allSessions
        : allSessions.filter((s) => Date.now() - new Date(s.updatedAt).getTime() <= args.days! * 24 * 60 * 60 * 1000);
    payload.judgment = computeJudgmentReport(sessions);
  }

  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
