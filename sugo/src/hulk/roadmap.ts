import { renderWorkResultMarkdown } from "../workResultReport.js";
import { computeCompletionGrade, labelId } from "../labelGuard.js";
import { loadAllSessions, saveSession } from "../session.js";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteFile, withFileLock } from "../fsUtil.js";
import { fetchRoadmapOrdering } from "../dashboard/fetch.js";
import { syncRoadmapLink, syncRoadmapSnapshot, unsyncRoadmapLink } from "../dashboard/sync.js";
import { mergeRoadmapOwnership, readySet, topoSort } from "./roadmapGraph.js";
import { roadmapFilePath, roadmapLockPath, workspaceDir } from "../work/storage.js";
import type { HumanBlocker, RoadmapFile, RoadmapLineageEntry, RoadmapNode, RoadmapNodeResult, RoadmapNodeStatus, RoadmapWorkResult, Task } from "./types.js";
import { requirementNodeId } from "./roadmapReq.js";
import type { SessionAssessment } from "../ontology/sessionAssessment.js";

async function readRoadmapFile(workspace: string): Promise<RoadmapFile> {
  let file: RoadmapFile;
  try {
    const raw = await readFile(roadmapFilePath(workspace), "utf-8");
    file = JSON.parse(raw) as RoadmapFile;
  } catch {
    return { nodes: [], schemaVersion: 1 };
  }
    // Old completed sessions already own the canonical bypass labels, but old reports did not carry them.
    // Hydrate before workspace sync so existing tasks can be reviewed without rerunning the pipeline.
    if (file.nodes.some(n => n.workResult?.path && !n.workResult.report?.bypassLabels)) {
      const sessions = (await loadAllSessions()).filter(s => s.state === "DONE" && s.data.hulkWorkspace === workspace);
      for (const node of file.nodes) {
        const result = node.workResult;
        if (!result?.path || result.report?.bypassLabels) continue;
        const chain = sessions.find(s => s.data.chainInfo.workResultPath === result.path)?.data.chainInfo;
        if (!chain?.workResultReport || !Array.isArray(chain.bypassLabels) ||
            (result.report && result.report.completedAt !== chain.workResultReport.completedAt)) continue;
        result.report = { ...chain.workResultReport, bypassLabels: [...chain.bypassLabels],
          completionGrade: computeCompletionGrade(chain.bypassLabels, chain.workResultReport.patchVersion).grade };
      }
    }
  return file;
}

async function writeRoadmapFile(workspace: string, file: RoadmapFile): Promise<void> {
  await mkdir(workspaceDir(workspace), { recursive: true });
  await atomicWriteFile(roadmapFilePath(workspace), JSON.stringify(file, null, 2));
  // §7.2: 모든 로드맵 변경은 결국 이 함수를 거치므로, 성공적인 로컬 쓰기 뒤 스냅샷 전체를
  // 논블로킹으로 흘려보낸다(개별 뮤테이션 함수마다 push를 반복하지 않기 위한 단일 지점).
  void syncRoadmapSnapshot(workspace, file.nodes).catch(() => {
    // 대시보드/재시도 큐 장애는 로컬 에이전트 동작을 막지 않는다.
  });
}

export interface RoadmapMutationResult {
  ok: boolean;
  error?: "DUPLICATE_ID" | "CYCLE" | "NODE_NOT_FOUND" | "LINK_REQUIRES_TASK_LEVEL" | "REQ_CONFIRM_AGENT_FORBIDDEN" | "BLOCKER_SESSION_MISMATCH" | "DECISION_REQUIRED";
  message?: string;
}

/** roadmap.json은 여러 파이프라인 이벤트(prd/review_done/수동 편집)가 동시에 건드릴 수 있는
 * 공유 파일이라 락으로 감싼다(tasks.json/registry.json과 같은 원칙, §D.3). */
async function withRoadmap<T>(workspace: string, fn: (file: RoadmapFile) => Promise<T> | T): Promise<T> {
  return withFileLock(roadmapLockPath(workspace), async () => {
    const file = await readRoadmapFile(workspace);
    return fn(file);
  });
}

export async function listRoadmapNodes(
  workspace: string,
  filter?: { level?: RoadmapNode["level"]; parent?: string },
): Promise<RoadmapNode[]> {
  const file = await readRoadmapFile(workspace);
  return file.nodes.filter(
    (n) => (!filter?.level || n.level === filter.level) && (!filter?.parent || n.parent === filter.parent),
  );
}

/**
 * v2 4층 헌법 이전 데이터(Task→REQ)를 Spec→Run→Task→REQ로 무손실 승격한다.
 * REQ-N은 PRD-local id라 workspace PK로 쓸 수 없으므로 parent task로 namespace한다.
 */
export async function reconcileRoadmapWithTasks(workspace: string, tasks: Task[]): Promise<void> {
  await withRoadmap(workspace, async (file) => {
    const oldToNewByParent = new Map<string, Map<string, string>>();
    for (const n of file.nodes) {
      if (n.level !== "subtask" || !n.parent || n.id.includes("::")) continue;
      const map = oldToNewByParent.get(n.parent) ?? new Map<string, string>();
      map.set(n.id, requirementNodeId(n.parent, n.id));
      oldToNewByParent.set(n.parent, map);
    }

    const migrated: RoadmapNode[] = file.nodes.map((node) => {
      if ((node.level !== "subtask" && node.level !== "step") || !node.parent) return { ...node };
      const localMap = oldToNewByParent.get(node.parent) ?? new Map<string, string>();
      const id = node.level === "subtask" ? (localMap.get(node.id) ?? node.id) : node.id;
      const dependsOn = node.dependsOn.flatMap((dep) => {
        if (dep.includes("::")) return [dep];
        const local = localMap.get(dep);
        return local ? [local] : [];
      });
      return { ...node, id, dependsOn };
    });

    const byId = new Map(migrated.map((n) => [n.id, n]));
    for (const task of tasks) {
      const existing = byId.get(task.id);
      // patch 실행은 run-<task>-vN을 부모로 가진다. 재동기화 때 기본 run을 하나 더
      // 만들지 않고 현재 실행 계층을 그대로 진실로 삼는다.
      const runId = existing?.parent?.startsWith("run-") ? existing.parent : `run-${task.id}`;
      const existingRun = byId.get(runId);
      const specId = existingRun?.parent?.startsWith("spec-") ? existingRun.parent : `spec-${task.id}`;
      const status: RoadmapNodeStatus = task.status === "done" ? "done" : task.status === "in_progress" ? "in_progress" : "pending";
      const existingSpec = byId.get(specId);
      byId.set(specId, {
        ...(existingSpec ?? { id: specId, title: task.title, level: "spec", dependsOn: [] }),
        status,
        specPath: task.prd_ref,
      });
      byId.set(runId, {
        ...(existingRun ?? { id: runId, title: task.title, level: "workstream", dependsOn: [], parent: specId }),
        status,
        parent: specId,
        specPath: task.prd_ref,
      });
      byId.set(task.id, {
        ...(existing ?? { id: task.id, title: task.title, level: "task", dependsOn: [], ref: task.id }),
        title: task.title,
        level: "task",
        status,
        parent: existing?.parent?.startsWith("run-") ? existing.parent : runId,
        specPath: task.prd_ref,
      });
      if (status === "done") {
        for (const [id, child] of byId) {
          if (child.parent === task.id) byId.set(id, { ...child, status: "done" });
        }
      }
    }
    // Task가 사라진 고아 REQ는 남기되 잘못된 cross-task 의존은 위에서 제거했다.
    await writeRoadmapFile(workspace, { ...file, nodes: [...byId.values()] });
  });
}

export async function getRoadmapNode(workspace: string, id: string): Promise<RoadmapNode | null> {
  const file = await readRoadmapFile(workspace);
  return file.nodes.find((n) => n.id === id) ?? null;
}

/** 완료 산출물은 Task와 기존 RUN에 함께 기록하되, patch 계보는 실제 작업 단위인 Task가 소유한다.
 * RUN에 lineage를 복제하면 캔버스가 RUN 자체를 patch 노드로 오인할 수 있다. */
export async function recordRoadmapWorkResult(
  workspace: string,
  taskId: string,
  workResult: RoadmapWorkResult,
  lineageEntry: RoadmapLineageEntry,
): Promise<void> {
  await withRoadmap(workspace, async (file) => {
    const task = file.nodes.find((node) => node.id === taskId && node.level === "task");
    if (!task) return;
    const requirements = file.nodes
      .filter((node) => node.parent === task.id && (node.level === "subtask" || node.level === "step"))
      .map((node) => ({ id: node.id, title: node.title, status: node.status }));
    const completedEntry: RoadmapLineageEntry = { ...lineageEntry, requirements, workResult };
    const targetIds = new Set([task.id, ...(task.parent ? [task.parent] : [])]);
    const nodes = file.nodes.map((node) => {
      if (!targetIds.has(node.id)) return node;
      if (node.id !== task.id) return { ...node, workResult };
      const previousLineage = node.lineage ?? [];
      const legacyFeatEntry: RoadmapLineageEntry[] = completedEntry.version > 0
        && !previousLineage.some((entry) => entry.version === 0)
        && node.workResult?.path
        ? [{
            version: 0,
            completedAt: node.workResult.endedAt ?? node.workResult.startedAt ?? completedEntry.completedAt,
            title: node.title,
            summary: node.workResult.summary,
            workResult: { ...node.workResult, patchVersion: 0 },
          }]
        : [];
      const lineage = [...legacyFeatEntry, ...previousLineage.filter((entry) => entry.version !== completedEntry.version), completedEntry]
        .sort((a, b) => a.version - b.version);
      return { ...node, workResult, lineage };
    });
    await writeRoadmapFile(workspace, { ...file, nodes });
  });
}

/**
 * v0.5 이전 또는 정식 commit 게이트 밖에서 완료된 Task는 status/summary만 있고 work-result가
 * 없을 수 있다. 그런 로컬 이력은 PRD 옆에 최소 work-result를 한 번만 복원해 Patch 진입점을
 * 제공한다. 원본 파일이나 이미 연결된 산출물은 절대 덮어쓰지 않는다.
 */
export async function backfillLegacyRoadmapWorkResults(workspace: string, tasks: Task[]): Promise<number> {
  let count = 0;
  for (const task of tasks) {
    if (task.status !== "done" || !task.summary || !task.prd_ref) continue;
    const node = await getRoadmapNode(workspace, task.id);
    if (!node || node.workResult?.path) continue;

    // Patch는 같은 feature 디렉터리의 prd.md/PRD-patch-vN.md를 요구한다. 실제 PRD가 있는
    // 완료 작업만 복원해, 존재하지 않는 산출물 경로를 버튼에 노출하지 않는다.
    const prdExists = await readFile(task.prd_ref, "utf8").then(() => true).catch(() => false);
    if (!prdExists) continue;
    const featureDir = dirname(task.prd_ref);
    const workResultPath = join(featureDir, "work-result.md");
    const existing = await readFile(workResultPath, "utf8").catch(() => null);
    if (existing === null) {
      await atomicWriteFile(
        workResultPath,
        `${task.summary}\n\n> 기존 완료 이력에서 복원한 work-result입니다. 정식 Sugo commit 게이트 증거는 포함하지 않습니다.\n`,
      );
    }
    await recordRoadmapWorkResult(
      workspace,
      task.id,
      {
        path: workResultPath,
        startedAt: task.started_at,
        endedAt: task.completed_at,
        summary: task.summary,
        parentTaskId: task.id,
        patchVersion: 0,
      },
      {
        version: 0,
        completedAt: task.completed_at ?? task.created_at,
        title: task.title,
        summary: task.summary,
      },
    );
    count += 1;
  }
  return count;
}

/** 새 노드를 추가한다. 중복 id, 또는 추가로 인해 전체 그래프가 사이클을 이루면 거부하고
 * 파일은 건드리지 않는다(오염된 절반-쓰기 방지 — sugo_plan의 "콘텐츠 게이트 먼저" 원칙과 동일). */
export async function addRoadmapNode(workspace: string, node: RoadmapNode): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    if (file.nodes.some((n) => n.id === node.id)) {
      return { ok: false, error: "DUPLICATE_ID", message: `이미 존재하는 노드 id입니다: ${node.id}` };
    }
    const candidate = { ...file, nodes: [...file.nodes, node] };
    const sorted = topoSort(candidate.nodes);
    if (sorted.cyclic) {
      return { ok: false, error: "CYCLE", message: `노드를 추가하면 의존성 그래프에 사이클이 생깁니다: ${node.id}` };
    }
    await writeRoadmapFile(workspace, candidate);
    return { ok: true };
  });
}

/** PRD REQ 승격(promotePrdRequirements) 등 여러 노드를 한 번에 반영한다 — 있으면 갱신, 없으면 추가(멱등). */
export async function upsertRoadmapNodes(workspace: string, nodes: RoadmapNode[]): Promise<void> {
  await withRoadmap(workspace, async (file) => {
    const byId = new Map(file.nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      const previous = byId.get(n.id);
      // PRD promotion supplies structural fields, not completed work. A patch must
      // retain the previous results until recordRoadmapWorkResult appends its cycle.
      byId.set(n.id, {
        ...n,
        ...(n.workResult === undefined && previous?.workResult ? { workResult: previous.workResult } : {}),
        ...(n.lineage === undefined && previous?.lineage ? { lineage: previous.lineage } : {}),
      });
    }
    await writeRoadmapFile(workspace, { ...file, nodes: [...byId.values()] });
  });
}

/** 한 Task의 현재 차수 REQ를 원자적으로 교체한다. 과거 차수 REQ는 lineage 스냅샷에 남고,
 * 캔버스의 live 자식에는 이번 feat/patch의 REQ만 보여야 한다. */
export async function replaceTaskRequirements(workspace: string, taskId: string, requirements: RoadmapNode[]): Promise<void> {
  await withRoadmap(workspace, async (file) => {
    const keep = file.nodes.filter(
      (node) => !(node.parent === taskId && (node.level === "subtask" || node.level === "step")),
    );
    const ids = new Set(requirements.map((node) => node.id));
    await writeRoadmapFile(workspace, {
      ...file,
      nodes: [...keep.filter((node) => !ids.has(node.id)), ...requirements],
    });
  });
}

export async function updateRoadmapNodeStatus(
  workspace: string,
  id: string,
  status: RoadmapNodeStatus,
  result?: RoadmapNodeResult,
): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const node = file.nodes.find((n) => n.id === id);
    if (!node) return { ok: false, error: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${id}` };
    node.status = status;
    if (result) node.result = result;
    await writeRoadmapFile(workspace, file);
    return { ok: true };
  });
}

export async function updateRoadmapNodeRuntimeAssessment(
  workspace: string,
  id: string,
  runtimeAssessment: SessionAssessment,
): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const node = file.nodes.find((candidate) => candidate.id === id && candidate.level === "task");
    if (!node) return { ok: false, error: "NODE_NOT_FOUND", message: `Task를 찾을 수 없습니다: ${id}` };
    node.runtimeAssessment = runtimeAssessment;
    await writeRoadmapFile(workspace, file);
    return { ok: true };
  });
}

export async function blockRoadmapNodeForHuman(
  workspace: string,
  id: string,
  blocker: HumanBlocker,
): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const node = file.nodes.find((candidate) => candidate.id === id);
    if (!node || node.level !== "task") return { ok: false, error: "NODE_NOT_FOUND", message: `Task를 찾을 수 없습니다: ${id}` };
    node.status = "blocked";
    node.note = blocker.question;
    node.humanBlocker = blocker;
    await writeRoadmapFile(workspace, file);
    return { ok: true };
  });
}

export async function resumeRoadmapNodeWithDecision(
  workspace: string,
  id: string,
  sessionId: string,
  decision: string,
): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const node = file.nodes.find((candidate) => candidate.id === id);
    if (!node || node.level !== "task") return { ok: false, error: "NODE_NOT_FOUND", message: `Task를 찾을 수 없습니다: ${id}` };
    if (!node.humanBlocker || node.humanBlocker.sessionId !== sessionId) {
      return { ok: false, error: "BLOCKER_SESSION_MISMATCH", message: "현재 차단을 만든 세션과 재개 세션이 다릅니다." };
    }
    if (!decision.trim()) return { ok: false, error: "DECISION_REQUIRED", message: "저장된 사용자 결정이 필요합니다." };
    node.status = "in_progress";
    node.note = `사용자 결정 반영: ${decision.trim()}`;
    delete node.humanBlocker;
    await writeRoadmapFile(workspace, file);
    return { ok: true };
  });
}

export async function removeRoadmapNode(workspace: string, id: string): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    if (!file.nodes.some((n) => n.id === id)) {
      return { ok: false, error: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${id}` };
    }
    const nodes = file.nodes
      .filter((n) => n.id !== id)
      .map((n) => (n.dependsOn.includes(id) ? { ...n, dependsOn: n.dependsOn.filter((d) => d !== id) } : n));
    await writeRoadmapFile(workspace, { ...file, nodes });
    return { ok: true };
  });
}

/**
 * §8.5 "링크 편집: link/unlink는 task↔task만(fail-closed)" — 두 노드가 모두 level:"task"가
 * 아니면 안전측으로 거부한다(워크스트림/서브태스크 계층 구조는 group/promotePrdRequirements가
 * 별도로 관리하는 영역이라 이 도구로 임의로 뒤섞이면 안 된다).
 */
export async function linkRoadmapNodes(workspace: string, fromId: string, toId: string): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const from = file.nodes.find((n) => n.id === fromId);
    const to = file.nodes.find((n) => n.id === toId);
    if (!from || !to) return { ok: false, error: "NODE_NOT_FOUND", message: "fromId/toId 노드를 찾을 수 없습니다." };
    if (from.level !== "task" || to.level !== "task") {
      return { ok: false, error: "LINK_REQUIRES_TASK_LEVEL", message: "link/unlink는 task 레벨 노드끼리만 허용됩니다." };
    }
    if (from.dependsOn.includes(toId)) return { ok: true };
    const candidateNodes = file.nodes.map((n) => (n.id === fromId ? { ...n, dependsOn: [...n.dependsOn, toId] } : n));
    if (topoSort(candidateNodes).cyclic) {
      return { ok: false, error: "CYCLE", message: `링크를 추가하면 사이클이 생깁니다: ${fromId} -> ${toId}` };
    }
    await writeRoadmapFile(workspace, { ...file, nodes: candidateNodes });
    void syncRoadmapLink(workspace, fromId, toId);
    return { ok: true };
  });
}

export async function unlinkRoadmapNodes(workspace: string, fromId: string, toId: string): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const from = file.nodes.find((n) => n.id === fromId);
    if (!from) return { ok: false, error: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${fromId}` };
    const nodes = file.nodes.map((n) => (n.id === fromId ? { ...n, dependsOn: n.dependsOn.filter((d) => d !== toId) } : n));
    await writeRoadmapFile(workspace, { ...file, nodes });
    void unsyncRoadmapLink(workspace, fromId, toId);
    return { ok: true };
  });
}

/** workstream 노드를 (없으면) 만들고 지정한 task id들을 그 아래로 묶는다. */
export async function groupRoadmapNodes(
  workspace: string,
  workstreamId: string,
  workstreamTitle: string,
  taskIds: string[],
): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const byId = new Map(file.nodes.map((n) => [n.id, n]));
    if (!byId.has(workstreamId)) {
      byId.set(workstreamId, {
        id: workstreamId,
        title: workstreamTitle,
        level: "workstream",
        status: "pending",
        dependsOn: [],
      });
    }
    for (const taskId of taskIds) {
      const task = byId.get(taskId);
      if (task) byId.set(taskId, { ...task, parent: workstreamId });
    }
    await writeRoadmapFile(workspace, { ...file, nodes: [...byId.values()] });
    return { ok: true };
  });
}

/** 로드맵 도입 이전에 생성된 HULK Task를 소급해서 task 레벨 노드로 승격한다(멱등 — 이미 있으면 no-op). */
export async function backfillRoadmapTask(workspace: string, taskId: string, title: string): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    if (file.nodes.some((n) => n.id === taskId)) return { ok: true };
    const node: RoadmapNode = { id: taskId, title, level: "task", status: "pending", dependsOn: [], ref: taskId };
    await writeRoadmapFile(workspace, { ...file, nodes: [...file.nodes, node] });
    return { ok: true };
  });
}

/**
 * §8.5 코퍼스 "반드시 거부: 에이전트가 REQ-CONFIRM을 직접 done 처리" — id가 `::REQ-CONFIRM`으로
 * 끝나면 이 경로로는 완료 불가. 오직 completeTaskRequirements(review_done 트리거)만 완료시킬 수 있다.
 */
export async function markRequirementDone(
  workspace: string,
  id: string,
  result?: RoadmapNodeResult,
): Promise<RoadmapMutationResult> {
  if (id.endsWith("::REQ-CONFIRM")) {
    return {
      ok: false,
      error: "REQ_CONFIRM_AGENT_FORBIDDEN",
      message: "REQ-CONFIRM은 에이전트가 직접 완료할 수 없습니다 — 사용자 review_done을 통해서만 완료됩니다.",
    };
  }
  return updateRoadmapNodeStatus(workspace, id, "done", result);
}

/**
 * §3/§8.5 "review_done → REQ + REQ-CONFIRM 자동완료": 이 taskId의 자식 노드(REQ들 + REQ-CONFIRM,
 * parent===taskId)를 전부 done으로 롤다운한다. 승격된 REQ가 없는 taskId(워크스페이스 미등록 등)는
 * 조용히 no-op — sugo_plan의 review_done 핸들러가 워크스페이스 유무와 무관하게 항상 호출해도
 * 안전해야 하기 때문이다.
 */
export async function completeTaskRequirements(workspace: string, taskId: string, summary: string, logId?: string): Promise<void> {
  await withRoadmap(workspace, async (file) => {
    const children = file.nodes.filter((n) => n.parent === taskId);
    if (children.length === 0) return;
    const nodes = file.nodes.map((n) => (n.parent === taskId ? { ...n, status: "done" as const, result: { summary, logId } } : n));
    await writeRoadmapFile(workspace, { ...file, nodes });
  });
}

export async function getReadySet(workspace: string): Promise<string[]> {
  const file = await readRoadmapFile(workspace);
  return readySet(file.nodes);
}

/**
 * §7.2 fetch(dependsOn pull): 대시보드에서 순서(dependsOn 등)를 받아와 로컬 노드에 병합한다.
 * 대시보드가 꺼져있거나 응답이 없으면(null) 아무것도 안 바꾸고 false를 반환한다 — 로컬 상태가
 * 곧 안전한 폴백이다(§7.2 "대시보드 다운이 파이프라인을 막지 않는다").
 */
export async function pullRoadmapOrdering(workspace: string): Promise<boolean> {
  const remote = await fetchRoadmapOrdering(workspace);
  if (!remote) return false;
  return withRoadmap(workspace, async (file) => {
    const merged = mergeRoadmapOwnership(file.nodes, remote);
    const completedSessions = (await loadAllSessions()).filter(s => s.state === "DONE" && s.data.hulkWorkspace === workspace);
    for (const node of merged) {
      const local = node.workResult;
      const incoming = remote.find(r => r.id === node.id)?.workResult;
      // Never replace execution evidence with a remote/older report. Only dashboard-owned approvals.
      if (!local?.report || !local.path || !incoming?.report || incoming.path !== local.path ||
          !Array.isArray(local.report.bypassLabels) || !Array.isArray(incoming.report.bypassLabels) ||
          incoming.report.completedAt !== local.report.completedAt || incoming.report.patchVersion !== local.report.patchVersion ||
          JSON.stringify((incoming.report.bypassLabels ?? []).map(labelId)) !== JSON.stringify((local.report.bypassLabels ?? []).map(labelId))) continue;
      const approvals = (incoming.report.humanApprovals ?? []).filter(e => e.workResultPath === local.path);
      local.report = { ...local.report, humanApprovals: approvals,
        completionGrade: computeCompletionGrade(local.report.bypassLabels ?? [], local.report.patchVersion, approvals).grade };
      await atomicWriteFile(local.path, renderWorkResultMarkdown(local.report));
      for (const entry of node.lineage ?? []) if (entry.workResult?.path === local.path) entry.workResult.report = local.report;
      for (const session of completedSessions) if (session.data.chainInfo.workResultPath === local.path &&
          session.data.chainInfo.workResultReport?.completedAt === local.report.completedAt) {
        session.data.chainInfo.workResultReport = local.report;
        await saveSession(session);
      }
    }
    await writeRoadmapFile(workspace, { ...file, nodes: merged });
    return true;
  });
}
