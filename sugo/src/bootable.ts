import { loadProjectConfig } from "./harness/config.js";

/** config.json의 detectedStack으로 "부팅 가능 스택(Spring Boot)"인지 판단 — code_done/review_done의 boot 관련 게이트가 공유. */
export async function isProjectBootable(projectPath: string): Promise<boolean> {
  const config = await loadProjectConfig(projectPath);
  return (config?.detectedStack.frameworks ?? []).some((f) => f.id.startsWith("framework/spring"));
}
