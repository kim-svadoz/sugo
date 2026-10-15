import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";

/** 플러그인 캐시가 먼저 지워져도 프로젝트 연결을 해제할 수 있는 독립 제거기를 설치한다. */
export async function ensureRecoveryUtility(): Promise<void> {
  const source = join(dirname(process.argv[1] ?? ""), "..", "scripts", "sugo-uninstall-standalone.mjs");
  const target = join(sugoHomeDir(), ".sugo", "bin", "sugo-uninstall.mjs");
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
