import { describe, it, expect } from 'vitest';
// .mjs 훅 모듈(allowJs로 해석) — 순수함수만 가져온다
import { decide, isTestFile, isDocFile, agentName } from '../hooks/scope-guard.mjs';

describe('scope-guard: agentName 정규화', () => {
  it('plugin-scoped agent_type에서 프론트매터 name만 뽑는다', () => {
    expect(agentName('sugo:test-agent')).toBe('test-agent');
    expect(agentName('sugo:docs-agent')).toBe('docs-agent');
    expect(agentName('test-agent')).toBe('test-agent'); // bare도 처리
    expect(agentName(undefined)).toBe('');
  });
});

describe('scope-guard: isTestFile (다언어)', () => {
  const yes = [
    'src/foo.test.ts',
    'src/foo.spec.js',
    'test/bar.ts',
    'tests/bar.py',
    '__tests__/baz.tsx',
    'pkg/foo_test.go',
    'spec/models/user_spec.rb',
    'tests/test_user.py',
    'src/main/java/FooTest.java',
    'src/UserTests.cs',
    'e2e/login.spec.ts',
  ];
  const no = [
    'src/foo.ts',
    'src/service/user.py',
    'main.go',
    'lib/index.js',
    'src/testable.ts', // 'test' 부분문자열이지만 테스트 아님
    'contest.ts',
  ];
  yes.forEach((p) => it(`테스트로 인식: ${p}`, () => expect(isTestFile(p)).toBe(true)));
  no.forEach((p) => it(`테스트 아님: ${p}`, () => expect(isTestFile(p)).toBe(false)));
});

describe('scope-guard: isDocFile', () => {
  const yes = ['README.md', 'docs/guide.md', 'CHANGELOG', 'notes.rst', 'adr/0001-x.adoc', 'documentation/api.mdx'];
  const no = ['src/index.ts', 'lib/util.js', 'config.json', 'main.py'];
  yes.forEach((p) => it(`문서로 인식: ${p}`, () => expect(isDocFile(p)).toBe(true)));
  no.forEach((p) => it(`문서 아님: ${p}`, () => expect(isDocFile(p)).toBe(false)));
});

describe('scope-guard: decide 강제', () => {
  it('test-agent이 테스트 파일 수정 → 허용', () => {
    expect(decide('sugo:test-agent', 'src/foo.test.ts').allow).toBe(true);
  });
  it('test-agent이 프로덕션 코드 수정 → 차단', () => {
    const r = decide('sugo:test-agent', 'src/foo.ts');
    expect(r.allow).toBe(false);
    expect(r.reason).toContain('테스트 파일만');
  });
  it('docs-agent이 문서 수정 → 허용', () => {
    expect(decide('sugo:docs-agent', 'docs/x.md').allow).toBe(true);
  });
  it('docs-agent이 코드 수정 → 차단', () => {
    const r = decide('sugo:docs-agent', 'src/index.ts');
    expect(r.allow).toBe(false);
    expect(r.reason).toContain('문서 파일만');
  });
  it('code-agent은 어떤 파일이든 제약 없음', () => {
    expect(decide('sugo:code-agent', 'src/index.ts').allow).toBe(true);
    expect(decide('sugo:code-agent', 'README.md').allow).toBe(true);
  });
  it('메인스레드(agent_type 없음)는 제약 없음', () => {
    expect(decide(undefined, 'src/index.ts').allow).toBe(true);
  });
  it('Windows 역슬래시 경로도 정상 판정', () => {
    expect(decide('sugo:test-agent', 'src\\foo.test.ts').allow).toBe(true);
    expect(decide('sugo:docs-agent', 'src\\index.ts').allow).toBe(false);
  });
});
