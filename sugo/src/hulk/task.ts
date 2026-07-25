import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { atomicWriteFile, withFileLock } from "../fsUtil.js";
import { syncTask } from "../dashboard/sync.js";
import { tasksFilePath, tasksLockPath, workspaceDir } from "./storage.js";
import type { Task, TasksFile, TaskPatchInfo, TaskStatus } from "./types.js";

function generateTaskId(): string {
  return `task-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

async function readTasksFile(workspace: string): Promise<TasksFile> {
  try {
    const raw = await readFile(tasksFilePath(workspace), "utf-8");
    return JSON.parse(raw) as TasksFile;
  } catch {
    return { tasks: [], last_updated: new Date().toISOString(), schemaVersion: 1 };
  }
}

async function writeTasksFile(workspace: string, file: TasksFile): Promise<void> {
  await mkdir(workspaceDir(workspace), { recursive: true });
  await atomicWriteFile(tasksFilePath(workspace), JSON.stringify(file, null, 2));
}

export interface AddTaskParams {
  title: string;
  project: string;
  status?: TaskStatus;
  priority?: string;
  description?: string;
  prd_ref?: string;
  tags?: string[];
}

/** tasks.json은 여러 도구/파이프라인 이벤트가 동시에 건드릴 수 있는 공유 파일이라 락으로 감싼다. */
export async function addTask(workspace: string, params: AddTaskParams): Promise<Task> {
  return withFileLock(tasksLockPath(workspace), async () => {
    const file = await readTasksFile(workspace);
    const now = new Date().toISOString();
    const task: Task = {
      id: generateTaskId(),
      title: params.title,
      project: params.project,
      status: params.status ?? "pending",
      priority: params.priority,
      description: params.description,
      prd_ref: params.prd_ref,
      tags: params.tags,
      created_at: now,
      started_at: params.status === "in_progress" ? now : undefined,
    };
    file.tasks.push(task);
    file.last_updated = now;
    await writeTasksFile(workspace, file);
    void syncTask(workspace, task);
    return task;
  });
}

export interface UpdateTaskParams {
  status?: TaskStatus;
  summary?: string;
  log_id?: string;
  completed_at?: string;
  patchInfo?: TaskPatchInfo;
}

export async function updateTask(workspace: string, taskId: string, params: UpdateTaskParams): Promise<Task | null> {
  return withFileLock(tasksLockPath(workspace), async () => {
    const file = await readTasksFile(workspace);
    const task = file.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    if (params.status) task.status = params.status;
    if (params.summary !== undefined) task.summary = params.summary;
    if (params.log_id !== undefined) task.log_id = params.log_id;
    if (params.completed_at !== undefined) task.completed_at = params.completed_at;
    else if (params.status === "done" && !task.completed_at) task.completed_at = new Date().toISOString();
    if (params.patchInfo !== undefined) task.patchInfo = params.patchInfo;
    file.last_updated = new Date().toISOString();
    await writeTasksFile(workspace, file);
    void syncTask(workspace, task);
    return task;
  });
}

export async function listTasks(
  workspace: string,
  filter?: { project?: string; status?: TaskStatus },
): Promise<Task[]> {
  const file = await readTasksFile(workspace);
  return file.tasks.filter(
    (t) => (!filter?.project || t.project === filter.project) && (!filter?.status || t.status === filter.status),
  );
}

export async function getTask(workspace: string, taskId: string): Promise<Task | null> {
  const file = await readTasksFile(workspace);
  return file.tasks.find((t) => t.id === taskId) ?? null;
}

/** §7.1 "base-task 매칭은 ref 파일명 우선": patch가 원본 Run을 재사용하려면 부모 PRD 경로로
 * 원본 태스크를 찾아야 한다. prd_ref가 정확히 일치하는 태스크를 우선하고, 없으면 파일명만이라도
 * 같은 태스크를 찾는다(경로 표기가 미묘하게 다른 경우의 방어적 폴백). */
export async function findTaskByPrdRef(workspace: string, prdRefPath: string): Promise<Task | null> {
  const file = await readTasksFile(workspace);
  const exact = file.tasks.find((t) => t.prd_ref === prdRefPath);
  if (exact) return exact;
  const targetFilename = prdRefPath.split(/[\\/]/).pop();
  return file.tasks.find((t) => t.prd_ref && t.prd_ref.split(/[\\/]/).pop() === targetFilename) ?? null;
}
