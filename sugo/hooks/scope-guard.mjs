// sugo 플러그인 PreToolUse 스코프 가드.
// test-agent은 테스트 파일만, docs-agent은 문서 파일만 Write/Edit 하도록 tools로는
// 강제 불가한 "파일 경로" 제약을 훅에서 강제한다(§5b). 다른 에이전트/메인스레드는 통과.
//
// Claude Code hook 규약: PreToolUse 입력이 stdin(JSON)으로 들어오고, deny하려면
//   {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}}
// 를 출력한다. 허용(간섭 안 함)일 땐 아무것도 출력하지 않고 정상 권한 흐름에 맡긴다.
// 플러그인 서브에이전트의 agent_type은 `sugo:test-agent`처럼 plugin-scoped 식별자다.

/** 경로를 소문자·슬래시 정규화. */
function norm(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}

/** basename 추출(정규화된 경로에서). */
function base(p) {
  const s = norm(p);
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** 테스트 파일인가? (다언어 관용 규칙) */
export function isTestFile(filePath) {
  const p = norm(filePath);
  const b = base(p);
  // 원본 대소문자 basename(CamelCase 접미사 판별용)
  const raw = String(filePath || '').replace(/\\/g, '/');
  const rb = raw.slice(raw.lastIndexOf('/') + 1);
  // 테스트 디렉터리
  if (/(^|\/)(tests?|__tests__|specs?|e2e|it|itest)\//.test(p)) return true;
  // 파일명 내 마커(소문자 규칙)
  if (/\.(test|spec)\.[a-z0-9]+$/.test(b)) return true; // foo.test.ts, foo.spec.js
  if (/\.(test|spec)$/.test(b)) return true;
  if (/_test\.[a-z0-9]+$/.test(b)) return true; // foo_test.go, foo_test.py
  if (/_spec\.[a-z0-9]+$/.test(b)) return true; // foo_spec.rb
  if (/^test_[^/]*\.[a-z0-9]+$/.test(b)) return true; // test_foo.py
  // CamelCase 접미사(FooTest.java, UserTests.cs, FooSpec.scala, FooIT.java) — 원본 대소문자로만
  if (/(Test|Tests|Spec|Specs|IT|ITCase)\.[A-Za-z0-9]+$/.test(rb)) return true;
  return false;
}

/** 문서 파일인가? */
export function isDocFile(filePath) {
  const p = norm(filePath);
  const b = base(p);
  if (/\.(md|mdx|markdown|rst|adoc|txt)$/.test(b)) return true;
  if (/(^|\/)(docs?|documentation|adr)\//.test(p)) return true;
  // 확장자 없는 관례 문서
  if (/^(readme|changelog|contributing|license|notice|authors|codeowners)$/.test(b.replace(/\.[a-z0-9]+$/, ''))) {
    return true;
  }
  return false;
}

/** agent_type(`sugo:test-agent`)에서 프론트매터 name만 추출 → 네임스페이스 변경에 강건. */
export function agentName(agentType) {
  if (!agentType) return '';
  const s = String(agentType);
  const i = s.lastIndexOf(':');
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * 순수 판정. { allow, reason } 반환.
 * - test-agent: 테스트 파일만 허용
 * - docs-agent: 문서 파일만 허용
 * - 그 외(code-agent/review-agent/메인스레드): 제약 없음(allow)
 */
export function decide(agentType, filePath) {
  const name = agentName(agentType);
  if (name === 'test-agent') {
    if (isTestFile(filePath)) return { allow: true };
    return {
      allow: false,
      reason:
        `sugo test-agent은 테스트 파일만 수정할 수 있다(프로덕션 코드 금지). ` +
        `범위 밖 경로: ${filePath}. 프로덕션 변경은 code-agent 소관이다.`,
    };
  }
  if (name === 'docs-agent') {
    if (isDocFile(filePath)) return { allow: true };
    return {
      allow: false,
      reason:
        `sugo docs-agent은 문서 파일만 수정할 수 있다(코드 금지). ` +
        `범위 밖 경로: ${filePath}. 코드 변경은 code-agent 소관이다.`,
    };
  }
  return { allow: true };
}

/** stdin 전체를 읽는다. */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    // stdin이 즉시 닫힌 환경 대비
    if (process.stdin.isTTY) resolve(data);
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse((await readStdin()) || '{}');
  } catch {
    process.exit(0); // 파싱 실패 시 간섭하지 않음(정상 흐름 유지)
  }
  const ti = input.tool_input || {};
  const filePath = ti.file_path || ti.path || ti.notebook_path || '';
  if (!filePath) process.exit(0);
  const { allow, reason } = decide(input.agent_type, filePath);
  if (allow) process.exit(0); // 간섭 안 함 → 정상 권한 흐름
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

// 직접 실행일 때만 main(테스트 import 시엔 순수함수만 사용).
if (process.argv[1] && norm(process.argv[1]).endsWith('/scope-guard.mjs')) {
  main();
}
