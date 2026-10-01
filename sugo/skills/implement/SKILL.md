---
name: implement
agent: code-agent
description: 'code-agent의 기본 스킬. PRD 기반 신규 기능 구현. "구현/만들어/추가해줘/implement/feature" 요청에 쓴다. 설계안 단계 골격을 따른다. bugfix와 refactor는 별도 스킬.'
---

# implement (code-agent 기본 스킬)

설계안 단계 골격을 따르고 gate-philosophy를 항상 지킨다.
AWS 조회는 `../../harness-library/aws-readonly-policy.md`의 공통 정책을 따르고 `sugo_aws_context`를 우선한다.

1. prereq: 세션과 PRD를 확인한다. `sugo_get_project_context`로 규칙, 하네스, CLAUDE.md를 로드한다(필수).
2. baseline: §4.0 시그널이 있으면 코딩 전에 기존 테스트 그린을 캡처한다(`sugo_record_test_evidence`).
3. 특화 도구 로드: code_start의 harnessToolMenu에 실린 도구를 능동 로드한다(§2).
4. 탐색과 분석: `sugo_explore`(AST)로 구조를 이해하고 요구(REQ-*)를 분석한다.
5. 설계와 승인: 비자명한 결정을 요약하고 필요하면 사용자 승인을 받는다.
6. 구현과 자체검증: 구현하고 컴파일과 자체 확인까지 한다.
7. 포맷: 감지된 포맷터를 적용한다.
8. PRD 교차검증: `sugo_analyze(changedFiles)`를 실제로 호출한다(§4.1).
9. 체인: `sugo_chain`으로 test-agent에 인계한다. 관례이지 서버가 강제하진 않는다(`test_start`
   게이트가 비어 있어 스킵해도 안 막힌다) — 그래도 다음 에이전트가 맨몸으로 시작하지 않도록 지킨다.

success: code_done 게이트 통과 후 test-agent로 체인.
on_failure: 게이트가 막은 이유를 전하고 실제로 충족시킨다. 라벨로 우회하지 않는다. 환경이 없을
때만 명시적으로 라벨을 붙인다.
