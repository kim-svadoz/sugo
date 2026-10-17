import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { deleteWorkspaceSync, syncWorkspace } from "../dashboard/sync.js";
import { workRootDir, workspaceDir, workspaceFilePath } from "./storage.js";
import type { Workspace } from "./types.js";

export async function loadWorkspace(name: string): Promise<Workspace | null> {
  try {
    const raw = await readFile(workspaceFilePath(name), "utf-8");
    return JSON.parse(raw) as Workspace;
  } catch {
    return null;
  }
}

/**
 * 없으면 생성, 있으면 projects를 병합(중복 제거)한다.
 *
 * §9 **un-delete:** soft delete된 이름을 다시 쓰면 되살린다. 삭제가 숨김이었지 소멸이 아니었으므로
 * 기존 projects/created_at은 그대로 두고 `deleted_at`만 떼어낸다. 대시보드에도 재sync해서
 * 양쪽이 "삭제됨"으로 어긋난 채 남지 않게 한다.
 */
export async function ensureWorkspace(name: string, projectPath?: string): Promise<Workspace> {
  const existing = await loadWorkspace(name);
  const projects = new Set(existing?.projects ?? []);
  if (projectPath) projects.add(projectPath);
  const workspace: Workspace = {
    name,
    projects: Array.from(projects),
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  await mkdir(workspaceDir(name), { recursive: true });
  await atomicWriteFile(workspaceFilePath(name), JSON.stringify(workspace, null, 2));
  void syncWorkspace(workspace); // §7.2 논블로킹 — 로컬 쓰기 완료 후 흘려보낸다(실패해도 이 함수는 이미 반환됨)
  return workspace;
}

/** `includeDeleted`를 켜지 않으면 soft delete된 워크스페이스는 보이지 않는다(§9). */
export async function listWorkspaces(includeDeleted = false): Promise<Workspace[]> {
  let entries;
  try {
    entries = await readdir(workRootDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const workspaces: Workspace[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const ws = await loadWorkspace(entry.name);
    if (!ws) continue;
    if (!includeDeleted && ws.deleted_at) continue;
    workspaces.push(ws);
  }
  return workspaces;
}

/**
 * 프로젝트를 소속된 모든 워크스페이스의 `projects`에서 뺀다. 제거가 일어난 워크스페이스 이름을
 * 돌려준다(없으면 빈 배열).
 *
 * §9 `sugo_delete`가 레지스트리만 지우고 워크스페이스 멤버십은 남겨서, 등록돼 있지도 않은 경로가
 * `sugo_workspace(get)`에 계속 보이는 고아 항목이 생겼다. 빼는 경로가 아예 없어 사용자가
 * `workspace.json`을 손으로 고쳐야 했다.
 *
 * soft delete된 워크스페이스도 대상에 포함한다 — 숨겨졌을 뿐 되살릴 수 있는 데이터라, 거기 남은
 * 고아는 `ensureWorkspace`로 복구했을 때 그대로 되살아난다.
 */
export async function removeProjectFromWorkspaces(projectPath: string): Promise<string[]> {
  const affected: string[] = [];
  for (const workspace of await listWorkspaces(true)) {
    if (!workspace.projects.includes(projectPath)) continue;
    const next: Workspace = { ...workspace, projects: workspace.projects.filter((p) => p !== projectPath) };
    await atomicWriteFile(workspaceFilePath(next.name), JSON.stringify(next, null, 2));
    void syncWorkspace(next); // §7.2 논블로킹 — ensureWorkspace와 같은 방식
    affected.push(next.name);
  }
  return affected;
}

// ── §9 워크스페이스 soft delete ──────────────────────────────────────────────

export interface DeleteWorkspaceOptions {
  /** 연결된 프로젝트가 있어도 하드 삭제를 진행한다. */
  force?: boolean;
  /** purge여도 디스크의 워크스페이스 디렉터리는 남긴다. */
  keepData?: boolean;
  /** 하드 삭제(레지스트리 제거 + 기본적으로 파일 삭제). 기본은 soft. */
  purge?: boolean;
}

export interface DeleteWorkspaceResult {
  ok: boolean;
  errorCode?: "INVALID_WORKSPACE_NAME" | "WORKSPACE_NOT_FOUND" | "WORKSPACE_HAS_PROJECTS";
  message?: string;
  mode?: "soft" | "purge";
  alreadyDeleted?: boolean;
  dataRemoved?: boolean;
}

/**
 * 워크스페이스 이름 화이트리스트. 이름이 그대로 경로 세그먼트가 되므로 `..`나 구분자를 허용하면
 * WORK 루트 밖을 지울 수 있다. **허용 문자만 통과**시키는 화이트리스트로 막는다(블랙리스트는
 * 언제나 빠뜨리는 게 생긴다).
 */
const VALID_WORKSPACE_NAME = /^[A-Za-z0-9._-]+$/;

function isValidWorkspaceName(name: string): boolean {
  if (!VALID_WORKSPACE_NAME.test(name)) return false;
  // 화이트리스트가 점을 허용하므로 "."/".."은 따로 쳐낸다.
  return name !== "." && name !== "..";
}

/**
 * §9 워크스페이스 삭제. **기본은 soft** — "삭제"가 곧 데이터 소멸이면 실수 한 번으로 누적된
 * 태스크·이력·체크포인트가 사라진다. 진짜 지우려면 `purge`를 명시해야 한다.
 *
 * - **soft(기본):** 이미 삭제됐으면 no-op(타임스탬프를 덮지 않는다 — 최초 삭제 시각이 정보다),
 *   아니면 `deleted_at=now` + 대시보드에 삭제 전파. 데이터 보존이라 `ensureWorkspace`로 복구된다.
 * - **purge:** 연결 프로젝트가 있으면 `force` 없이는 차단. `!keepData`면 디렉터리를 실제로 지우되,
 *   지우기 직전에 **경로가 WORK base 하위인지 이중검증**한다(이름 검사를 통과했더라도 심볼릭
 *   링크나 절대경로 주입 같은 경로 하나만 잘못돼도 홈 디렉터리를 날릴 수 있는 연산이라).
 */
export async function deleteWorkspace(name: string, options: DeleteWorkspaceOptions = {}): Promise<DeleteWorkspaceResult> {
  if (!isValidWorkspaceName(name)) {
    return { ok: false, errorCode: "INVALID_WORKSPACE_NAME", message: `사용할 수 없는 워크스페이스 이름입니다: ${JSON.stringify(name)}` };
  }

  const existing = await loadWorkspace(name);
  if (!existing) {
    return { ok: false, errorCode: "WORKSPACE_NOT_FOUND", message: `워크스페이스를 찾을 수 없습니다: ${name}` };
  }

  if (!options.purge) {
    if (existing.deleted_at) return { ok: true, mode: "soft", alreadyDeleted: true, dataRemoved: false };
    const deleted: Workspace = { ...existing, deleted_at: new Date().toISOString() };
    await atomicWriteFile(workspaceFilePath(name), JSON.stringify(deleted, null, 2));
    void deleteWorkspaceSync(name);
    return { ok: true, mode: "soft", alreadyDeleted: false, dataRemoved: false };
  }

  if (existing.projects.length > 0 && !options.force) {
    return {
      ok: false,
      errorCode: "WORKSPACE_HAS_PROJECTS",
      message: `연결된 프로젝트 ${existing.projects.length}개가 있습니다. 하드 삭제하려면 force가 필요합니다.`,
    };
  }

  let dataRemoved = false;
  if (!options.keepData) {
    const target = resolve(workspaceDir(name));
    const base = resolve(workRootDir());
    const rel = relative(base, target);
    // base 밖(rel이 비었거나 ".."로 시작)이면 절대 지우지 않는다. 이름 검사를 이미 통과했더라도
    // 재귀 삭제는 경로 하나만 어긋나도 되돌릴 수 없어서, 실행 직전에 한 번 더 확인한다.
    // Windows에서 두 경로의 드라이브가 다르면 relative()가 ".."가 아니라 절대경로(`D:\…`)를
    // 돌려주므로 startsWith("..") 검사만으로는 base 밖을 통과시킨다 — isAbsolute로 같이 막는다.
    const insideBase = rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel) && target !== base;
    if (insideBase) {
      await rm(target, { recursive: true, force: true });
      dataRemoved = true;
    }
  }
  void deleteWorkspaceSync(name, { purge: true });
  return { ok: true, mode: "purge", alreadyDeleted: false, dataRemoved };
}
