import { homedir } from "node:os";

/**
 * SUGO_HOME_OVERRIDE가 설정돼 있으면 그걸 홈으로 취급 — 단위테스트에서 실제 ~/.claude/sugo를
 * 건드리지 않고 tmpdir을 홈처럼 써서 파일 IO를 실배선으로 검증하기 위함.
 */
export function sugoHomeDir(): string {
  return process.env.SUGO_HOME_OVERRIDE ?? homedir();
}
