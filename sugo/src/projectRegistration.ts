import { access, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sugoHomeDir } from "./homeDir.js";
import { syncProjectHarness } from "./harness/sync.js";
import { ensureWorkspace } from "./work/workspace.js";

export interface ProjectRegistrationInput {
  projectPath: string;
  workspace: string;
}

const PROJECT_MARKERS = new Set([".git", "package.json", "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "composer.json", "Gemfile", "Makefile", "src"]);

export async function assertProjectDirectory(projectPath: string): Promise<void> {
  const projectStat = await stat(projectPath).catch(() => null);
  if (!projectStat?.isDirectory()) {
    throw Object.assign(new Error("프로젝트 폴더를 찾을 수 없습니다."), { code: "PROJECT_PATH_NOT_FOUND" });
  }
  const entries = await readdir(projectPath).catch(() => []);
  if (!entries.some((entry) => PROJECT_MARKERS.has(entry))) {
    throw Object.assign(new Error("Git 저장소, 빌드 설정 또는 소스 폴더가 있는 프로젝트를 선택하세요."), { code: "PROJECT_MARKER_NOT_FOUND" });
  }
}

export async function assertProjectRegistrationAllowed(): Promise<void> {
  const retainedData = join(sugoHomeDir(), ".sugo", "data");
  if (await access(retainedData).then(() => true, () => false)) {
    throw Object.assign(new Error("비활성 보관된 Sugo 데이터의 복구 또는 폐기를 먼저 결정해야 합니다."), { code: "RETAINED_DATA_DECISION_REQUIRED" });
  }
}

export async function registerSugoProject(input: ProjectRegistrationInput) {
  const projectPath = resolve(input.projectPath);
  if (!/^[A-Za-z0-9._-]+$/.test(input.workspace) || input.workspace === "." || input.workspace === "..") {
    throw Object.assign(new Error("사용할 수 없는 도메인 이름입니다."), { code: "INVALID_WORKSPACE_NAME" });
  }
  await assertProjectDirectory(projectPath);
  await assertProjectRegistrationAllowed();

  const result = await syncProjectHarness({ projectPath, workspace: input.workspace });
  await ensureWorkspace(input.workspace, projectPath);
  return {
    ok: true as const,
    projectPath,
    projectName: result.projectName,
    workspace: input.workspace,
    detectedStack: result.config.detectedStack,
    appliedHarnesses: result.composeResult.appliedHarnesses,
    warnings: result.composeResult.warnings,
  };
}
