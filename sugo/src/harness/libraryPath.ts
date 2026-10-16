import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sugoHomeDir } from "../homeDir.js";

/**
 * harness-library/ 위치를 실행 컨텍스트와 무관하게 찾는다.
 * - vitest로 소스(src/harness/*.ts)를 직접 실행할 때: 이 파일 기준 ../../harness-library
 * - esbuild로 dist/index.bundle.cjs 하나로 번들된 실행 시: 번들 파일 기준 ../harness-library
 * esbuild가 import.meta.url을 번들 파일 경로 기준으로 shim해주므로 두 경우 모두 fileURLToPath로 안전하게 계산된다.
 */
export function defaultHarnessLibraryDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", "..", "harness-library"), join(here, "..", "harness-library")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

/** 사용자가 수정한 하네스만 저장한다. 배포 캐시는 절대 수정하지 않는다. */
export function userHarnessOverrideDir(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "harness-overrides");
}
