import { loadProjectConfig, saveProjectConfig } from "./config.js";

export class ToggleProjectError extends Error {
  constructor(
    public readonly code: "PROJECT_NOT_REGISTERED",
    message: string,
  ) {
    super(message);
  }
}

/** §9 라이프사이클 sugo_disable/sugo_enable 공용 구현: config.disabled만 갈아끼운다. */
export async function setProjectDisabled(projectPath: string, disabled: boolean): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  if (!config) {
    throw new ToggleProjectError("PROJECT_NOT_REGISTERED", `등록된 프로젝트가 아닙니다(sugo/config.json 없음): ${projectPath}`);
  }
  await saveProjectConfig({ ...config, disabled, lastUpdated: new Date().toISOString() });
}
