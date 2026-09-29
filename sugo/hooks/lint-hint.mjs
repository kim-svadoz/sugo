// sugo 플러그인 PostToolUse lint 힌트 훅(§P6-3).
//
// Edit가 끝난 직후 프로젝트의 lint 명령(sugo_add가 감지한 detectedStack.commands.lint)을 돌려,
// 실패하면 stderr + exit 2로 Claude 컨텍스트에 실패 요약을 얹는다. Edit는 이미 실행된 뒤라 이
// 훅은 절대 편집을 막을 수 없다 — 순수하게 "더 빠르고 싼 실패 신호"를 추가하는 것뿐이다(느린
// test-agent 전체 호출에만 의존하던 것의 보완).
//
// Claude Code hook 규약: PostToolUse 입력이 stdin(JSON)으로 들어온다(tool_name, tool_input 등).
// cwd/session_id는 문서화돼 있지 않아 신뢰하지 않는다 — 프로젝트 루트는 tool_input.file_path에서
// 위로 올라가며 sugo/config.json을 찾아 판별한다. 실패는 exit 2 + stderr(문서화된 "no block,
// stderr shown to Claude" 경로), 통과/무관 경우는 exit 0으로 조용히 지나간다.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_COOLDOWN_MS = 8000;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_WALK_UP = 64;

/** filePath에서 위로 올라가며 sugo/config.json이 있는 첫 디렉터리를 프로젝트 루트로 본다. */
export function findProjectRoot(filePath, exists = existsSync) {
  if (!filePath) return null;
  let dir = resolve(dirname(filePath));
  for (let i = 0; i < MAX_WALK_UP; i++) {
    if (exists(join(dir, 'sugo', 'config.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null; // 파일시스템 루트에 도달
    dir = parent;
  }
  return null;
}

/** 파싱된 sugo/config.json에서 lint 명령을 뽑는다. 없으면 null(추측하지 않는다). */
export function pickLintCommand(config) {
  const lint = config?.detectedStack?.commands?.lint;
  return typeof lint === 'string' && lint.trim().length > 0 ? lint : null;
}

/** 마지막 실행 이후 쿨다운 안이면 이번엔 건너뛴다. lastRunAt이 없으면 항상 실행. */
export function withinCooldown(lastRunAt, nowMs, cooldownMs) {
  if (!lastRunAt) return false;
  const last = Date.parse(lastRunAt);
  if (Number.isNaN(last)) return false;
  return nowMs - last < cooldownMs;
}

function statePath(projectRoot) {
  return join(projectRoot, 'sugo', 'lint-hint-state.json');
}

function readLastRunAt(projectRoot) {
  try {
    const raw = readFileSync(statePath(projectRoot), 'utf-8');
    return JSON.parse(raw)?.lastRunAt ?? null;
  } catch {
    return null;
  }
}

function writeLastRunAt(projectRoot, iso) {
  try {
    mkdirSync(join(projectRoot, 'sugo'), { recursive: true });
    writeFileSync(statePath(projectRoot), JSON.stringify({ lastRunAt: iso }));
  } catch {
    // 상태 저장 실패는 다음 호출이 쿨다운 없이 다시 도는 정도의 손해라 무시한다 — 훅 자체를 막지 않는다.
  }
}

/** 실패 시 사람이 읽을 요약(명령/종료코드/출력 꼬리)을 만든다. 컨텍스트 낭비를 막기 위해 길이를 자른다. */
export function formatFailureSummary(command, exitCode, output, maxChars = 3000) {
  const trimmed = output.length > maxChars ? `...(생략)...\n${output.slice(-maxChars)}` : output;
  return (
    `[sugo lint-hint] 방금 편집 후 lint가 실패했습니다(참고용 신호 — 편집 자체는 막지 않습니다).\n` +
    `명령: ${command}\n종료코드: ${exitCode}\n\n${trimmed}`
  );
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve(data);
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse((await readStdin()) || '{}');
  } catch {
    process.exit(0);
  }
  const ti = input.tool_input || {};
  const filePath = ti.file_path || '';
  if (!filePath) process.exit(0);

  const projectRoot = findProjectRoot(filePath);
  if (!projectRoot) process.exit(0); // 등록 안 된 프로젝트 — 간섭하지 않는다

  let config;
  try {
    config = JSON.parse(readFileSync(join(projectRoot, 'sugo', 'config.json'), 'utf-8'));
  } catch {
    process.exit(0);
  }
  const lintCommand = pickLintCommand(config);
  if (!lintCommand) process.exit(0); // 감지된 lint 명령이 없으면 조용히 지나간다(§P6-3: 추측 금지)

  const cooldownMs = Number(process.env.SUGO_LINT_HINT_COOLDOWN_MS) || DEFAULT_COOLDOWN_MS;
  const now = Date.now();
  if (withinCooldown(readLastRunAt(projectRoot), now, cooldownMs)) process.exit(0);

  writeLastRunAt(projectRoot, new Date(now).toISOString());

  const timeoutMs = Number(process.env.SUGO_LINT_HINT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const result = spawnSync(lintCommand, {
    cwd: projectRoot,
    shell: true,
    encoding: 'utf-8',
    timeout: timeoutMs,
  });

  if (result.error || result.signal || (result.status !== null && result.status !== 0)) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const detail = result.signal
      ? `(timeout/signal: ${result.signal})`
      : String(result.status);
    process.stderr.write(formatFailureSummary(lintCommand, detail, output || '(출력 없음)'));
    process.exit(2);
  }
  process.exit(0);
}

// 직접 실행일 때만 main(테스트 import 시엔 순수함수만 사용) — scope-guard.mjs와 같은 패턴.
if (process.argv[1] && resolve(process.argv[1]).endsWith('/lint-hint.mjs')) {
  main();
}
