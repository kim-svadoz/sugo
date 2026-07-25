import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * wasm-grammars/ 위치를 실행 컨텍스트와 무관하게 찾는다 — harness-library용
 * defaultHarnessLibraryDir()와 동일한 패턴(소스 직접 실행 vs 번들 실행 둘 다 지원).
 */
export function defaultWasmGrammarsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // 소스 직접 실행(vitest): src/ast -> ../../wasm-grammars (sugo/wasm-grammars)
  // 번들 실행(dist/index.bundle.mjs, 파일 하나): dist -> ../wasm-grammars (sugo/wasm-grammars)
  const candidates = [join(here, "..", "..", "wasm-grammars"), join(here, "..", "wasm-grammars")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}
