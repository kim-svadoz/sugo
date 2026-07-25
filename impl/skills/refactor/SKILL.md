---
name: refactor
description: code-agent 리팩토링 스킬 — 동작을 바꾸지 않고 구조만 개선한다. 신규 테스트를 추가하지 않고 기존 그린을 유지한다. "리팩토링/정리/구조 개선/refactor/clean up" 요청.
---

# refactor (code-agent)

**동작 불변 + 신규 테스트 없음.** 안전은 기존 스위트가 계속 green인 것으로만 증명한다.

1. **기존 그린 확인** — 리팩토링 전에 기존 테스트가 전부 green인지 먼저 확인한다(green이 아니면
   리팩토링하지 마라 — 먼저 bugfix).
2. **컨텍스트** — `sugo_get_project_context` + `sugo_explore`로 구조 파악.
3. **구조 개선** — 외부 동작(공개 계약)을 바꾸지 않고 내부 구조만 개선한다.
4. **재검증** — 기존 스위트를 다시 돌려 여전히 green인지 확인한다. **신규 테스트는 추가하지 않는다**
   (추가하면 그건 리팩토링이 아니라 기능 변경).
5. 필요시 `sugo_chain`으로 test-agent가 회귀만 재확인하게 인계.

**success:** 구조 개선 + 기존 스위트 green 유지 + 공개 동작 불변. **on_failure:** 동작이 바뀌면
리팩토링 아님 — feat/bugfix로 전환한다.
