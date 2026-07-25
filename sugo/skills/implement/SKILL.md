---
name: implement
description: code-agent의 기본 스킬 — PRD 기반 신규 기능 구현. "구현/만들어/추가해줘/implement/feature" 요청. 설계안 단계 골격을 따른다. (bugfix/refactor는 별도 스킬.)
---

# implement (code-agent 기본 스킬)

설계안 단계 골격. gate-philosophy를 항상 지킨다.

1. **prereq** — 세션/PRD 확인. `sugo_get_project_context`로 규칙·하네스·CLAUDE.md 로드(필수).
2. **baseline** — §4.0 시그널 있으면 코딩 전 기존 테스트 그린 캡처(`sugo_record_test_evidence`).
3. **특화 도구 로드** — code_start의 harnessToolMenu 도구 능동 로드(§2).
4. **탐색·분석** — `sugo_explore`(AST)로 구조 이해 + 요구(REQ-*) 분석.
5. **설계·승인** — 비자명 결정 요약, 필요시 사용자 승인.
6. **구현·자체검증** — 구현 + 컴파일/자체 확인.
7. **포맷** — 감지된 포맷터 적용.
8. **PRD 교차검증** — `sugo_analyze(changedFiles)` **실호출**(§4.1).
9. **체인(필수)** — `sugo_chain`으로 test-agent 인계.

**success:** code_done 게이트 통과 + test-agent 체인. **on_failure:** 게이트 이유를 전하고 실제로
충족(라벨 우회 금지, 환경부재만 명시 라벨).
