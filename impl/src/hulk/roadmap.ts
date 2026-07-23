import { mkdir, readFile } from "node:fs/promises";
import { atomicWriteFile, withFileLock } from "../fsUtil.js";
import { syncRoadmapSnapshot } from "../dashboard/sync.js";
import { readySet, topoSort } from "./roadmapGraph.js";
import { roadmapFilePath, roadmapLockPath, workspaceDir } from "./storage.js";
import type { RoadmapFile, RoadmapNode, RoadmapNodeResult, RoadmapNodeStatus } from "./types.js";

async function readRoadmapFile(workspace: string): Promise<RoadmapFile> {
  try {
    const raw = await readFile(roadmapFilePath(workspace), "utf-8");
    return JSON.parse(raw) as RoadmapFile;
  } catch {
    return { nodes: [], schemaVersion: 1 };
  }
}

async function writeRoadmapFile(workspace: string, file: RoadmapFile): Promise<void> {
  await mkdir(workspaceDir(workspace), { recursive: true });
  await atomicWriteFile(roadmapFilePath(workspace), JSON.stringify(file, null, 2));
  // §7.2: 모든 로드맵 변경은 결국 이 함수를 거치므로, 성공적인 로컬 쓰기 뒤 스냅샷 전체를
  // 논블로킹으로 흘려보낸다(개별 뮤테이션 함수마다 push를 반복하지 않기 위한 단일 지점).
  void syncRoadmapSnapshot(workspace, file.nodes);
}

export interface RoadmapMutationResult {
  ok: boolean;
  error?: "DUPLICATE_ID" | "CYCLE" | "NODE_NOT_FOUND" | "LINK_REQUIRES_TASK_LEVEL" | "REQ_CONFIRM_AGENT_FORBIDDEN";
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

export async function getRoadmapNode(workspace: string, id: string): Promise<RoadmapNode | null> {
  const file = await readRoadmapFile(workspace);
  return file.nodes.find((n) => n.id === id) ?? null;
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
    for (const n of nodes) byId.set(n.id, n);
    await writeRoadmapFile(workspace, { ...file, nodes: [...byId.values()] });
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
    return { ok: true };
  });
}

export async function unlinkRoadmapNodes(workspace: string, fromId: string, toId: string): Promise<RoadmapMutationResult> {
  return withRoadmap(workspace, async (file) => {
    const from = file.nodes.find((n) => n.id === fromId);
    if (!from) return { ok: false, error: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${fromId}` };
    const nodes = file.nodes.map((n) => (n.id === fromId ? { ...n, dependsOn: n.dependsOn.filter((d) => d !== toId) } : n));
    await writeRoadmapFile(workspace, { ...file, nodes });
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
