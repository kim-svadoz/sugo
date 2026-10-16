---
name: refactor
agent: code-agent
description: 'code-agent 리팩토링 스킬. 동작을 바꾸지 않고 구조만 개선한다. 신규 테스트를 추가하지 않고 기존 그린을 유지한다. "리팩토링/정리/구조 개선/refactor/clean up" 요청에 쓴다.'
---

# refactor (code-agent)

코드 주석과 이름은 `../../harness-library/code-quality-policy.md`의 공통 정책을 따른다.

동작은 불변이고 신규 테스트는 추가하지 않는다. 안전은 기존 스위트가 계속 green인 것으로만 증명한다.

1. 기존 그린 확인: 리팩토링 전에 기존 테스트가 전부 green인지 확인한다. green이 아니면 리팩토링하지
   않고 bugfix를 먼저 한다.
2. 컨텍스트: `sugo_get_project_context`와 `sugo_explore`로 구조를 파악한다.
3. 구조 개선: 외부 동작(공개 계약)을 바꾸지 않고 내부 구조만 개선한다.
4. 재검증: 기존 스위트를 다시 돌려 여전히 green인지 확인한다. 신규 테스트는 추가하지 않는다.
   추가한다면 그건 리팩토링이 아니라 기능 변경이다.
5. 필요하면 `sugo_chain`으로 test-agent가 회귀만 재확인하게 인계한다.

success: 구조가 개선되고 기존 스위트가 green을 유지하며 공개 동작이 그대로인 상태.
on_failure: 동작이 바뀌었다면 리팩토링이 아니다. feat이나 bugfix로 전환한다.

