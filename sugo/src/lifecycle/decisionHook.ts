/**
 * 사람 결정 대기를 Claude 세션 생존과 상관없이 이어 주는 훅 진입점(dist/decision-hook.mjs).
 *   stop:   이 대화가 만든 결정 대기가 있으면 정지를 미루고 결정을 기다린다. 결정이 오면 정지를 막고 재개를 지시한다.
 *   prompt: 어느 Claude 세션이든 결정이 저장됐는데 반영되지 않은 작업이 있으면 재개 안내를 문맥에 넣는다.
 * 어떤 경우에도 실패로 끝내지 않는다. 판단할 수 없으면 아무것도 출력하지 않고 exit 0.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchBlockerDecision, type RemoteBlockerDecision } from "../dashboard/fetch.js";
import { atomicWriteFile } from "../fsUtil.js";
import { loadAllSessions } from "../session.js";
import { sugoHomeDir } from "../homeDir.js";

export interface PendingDecision {
  sessionId: string;
  featureName: string;
  workspace: string;
  taskId: string;
}

export interface ArrivedDecision extends PendingDecision {
  response: string;
  answeredAt?: string;
}

export async function pendingDecisions(): Promise<PendingDecision[]> {
  // 세션 파일을 읽지 못하면 기다릴 대상이 없는 것으로 보고 훅이 대화를 막지 않게 한다.
  const sessions = await loadAllSessions().catch(() => []);
  return sessions.flatMap((session) => {
    const gate = session.data.humanDecisionGate;
    return gate ? [{ sessionId: session.id, featureName: session.featureName, workspace: gate.workspace, taskId: gate.taskId }] : [];
  });
}

export async function arrivedDecisions(pending: PendingDecision[], fetchDecision: (workspace: string, taskId: string) => Promise<RemoteBlockerDecision | null> = fetchBlockerDecision): Promise<ArrivedDecision[]> {
  const results = await Promise.all(pending.map(async (item): Promise<ArrivedDecision | null> => {
    // Console이 꺼져 있으면 결정이 아직 없는 것과 같다. 다음 확인이나 다음 입력에서 다시 본다.
    const remote = await fetchDecision(item.workspace, item.taskId).catch(() => null);
    const response = remote?.decision?.response?.trim();
    if (!response) return null;
    if (remote?.blocker?.sessionId && remote.blocker.sessionId !== item.sessionId) return null;
    return { ...item, response, answeredAt: remote?.decision?.answered_at };
  }));
  return results.filter((item): item is ArrivedDecision => item !== null);
}

export function resumeInstruction(decision: ArrivedDecision): string {
  return [
    `Sugo 작업 "${decision.featureName}"에 Dashboard 결정이 저장되어 있습니다: "${decision.response}"`,
    `sugo_roadmap(action:"resume_with_decision", workspace:"${decision.workspace}", id:"${decision.taskId}", sessionId:"${decision.sessionId}")을 호출하고, 돌려받은 resumeAction부터 같은 sessionId로 이어 가세요.`,
  ].join("\n");
}

/** 이 대화에서 결정 대기를 만든 sugo 세션만 고른다. 다른 터미널의 대기 때문에 이 대화를 붙잡지 않는다. */
export function decisionsOfTranscript(pending: PendingDecision[], transcript: string): PendingDecision[] {
  return pending.filter((item) => transcript.includes(item.sessionId));
}

export interface StopOptions {
  transcript: string;
  waitMs: number;
  pollMs: number;
  pending?: () => Promise<PendingDecision[]>;
  fetchDecision?: (workspace: string, taskId: string) => Promise<RemoteBlockerDecision | null>;
}

export async function waitForDecisionOnStop(options: StopOptions): Promise<{ decision: "block"; reason: string } | null> {
  const deadline = Date.now() + options.waitMs;
  for (;;) {
    const own = decisionsOfTranscript(await (options.pending ?? pendingDecisions)(), options.transcript);
    if (own.length === 0) return null;
    const arrived = await arrivedDecisions(own, options.fetchDecision);
    if (arrived.length > 0) return { decision: "block", reason: arrived.map(resumeInstruction).join("\n\n") };
    if (Date.now() + options.pollMs > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }
}

/** 같은 Claude 세션에 같은 결정을 두 번 알리지 않는다. */
export async function unseenDecisions(claudeSessionId: string, arrived: ArrivedDecision[], noticePath = join(sugoHomeDir(), ".claude", "sugo", "decision-notices.json")): Promise<ArrivedDecision[]> {
  let seen: Record<string, string[]> = {};
  try { seen = JSON.parse(readFileSync(noticePath, "utf8")) as Record<string, string[]>; } catch { /* 처음 알림 */ }
  const keys = new Set(seen[claudeSessionId] ?? []);
  const fresh = arrived.filter((item) => !keys.has(`${item.sessionId}:${item.answeredAt ?? item.response}`));
  if (fresh.length > 0) {
    seen[claudeSessionId] = [...keys, ...fresh.map((item) => `${item.sessionId}:${item.answeredAt ?? item.response}`)];
    // 기록하지 못하면 다음 입력에서 한 번 더 알릴 뿐이다.
    await atomicWriteFile(noticePath, `${JSON.stringify(seen)}\n`).catch(() => undefined);
  }
  return fresh;
}

export function promptContext(arrived: ArrivedDecision[]): string {
  return [
    ...arrived.map(resumeInstruction),
    "사용자의 이번 요청이 이 작업과 관계없으면 요청을 먼저 처리하고, 이 작업을 이어 갈지 한 줄로 물어보세요.",
  ].join("\n\n");
}

function readStdin(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => { try { resolve(JSON.parse(body) as Record<string, unknown>); } catch { resolve({}); } });
    process.stdin.on("error", () => resolve({}));
  });
}

async function main(mode: string | undefined): Promise<void> {
  const input = await readStdin();
  if (mode === "stop") {
    const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path : "";
    let transcript = "";
    try { transcript = readFileSync(transcriptPath, "utf8"); } catch { return; }
    const result = await waitForDecisionOnStop({
      transcript,
      waitMs: Number(process.env.SUGO_DECISION_WAIT_MS ?? 590_000),
      pollMs: Number(process.env.SUGO_DECISION_POLL_MS ?? 3_000),
    });
    if (result) process.stdout.write(JSON.stringify(result));
    return;
  }
  if (mode === "prompt") {
    const claudeSessionId = typeof input.session_id === "string" ? input.session_id : "unknown";
    const fresh = await unseenDecisions(claudeSessionId, await arrivedDecisions(await pendingDecisions()));
    if (fresh.length > 0) process.stdout.write(promptContext(fresh));
  }
}

if (process.argv[1]?.endsWith("decision-hook.mjs")) {
  // 훅 실패가 사용자의 대화를 막지 않도록 어떤 오류든 정지·입력을 허용하는 쪽으로 끝낸다.
  await main(process.argv[2]).catch((error) => console.error("[sugo] decision hook failed:", error instanceof Error ? error.message : error));
  process.exit(0);
}
