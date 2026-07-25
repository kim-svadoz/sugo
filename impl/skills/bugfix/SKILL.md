---
name: bugfix
description: code-agent 버그 수정 스킬 — 재현 테스트를 먼저 쓰고 고친다. "버그/에러/안 돼/고쳐줘/bug/fix/broken" 요청(negative: 테스트만/문서/리팩토링). sugo_route가 이 스킬로 보낸다.
---

# bugfix (code-agent)

**재현 없이 고치지 마라.** 순서가 핵심이다.

1. **재현** — 버그를 드러내는 **실패하는 테스트**를 먼저 작성한다(red 고정). 재현 안 되면 원인부터 좁힌다.
2. **컨텍스트** — `sugo_get_project_context` + `sugo_explore`로 관련 코드 이해.
3. **수정** — 최소 변경으로 근본 원인을 고친다. 증상만 덮지 마라.
4. **검증** — 1의 재현 테스트가 green으로 바뀌고 기존 스위트가 계속 green인지 확인.
5. **PRD 교차검증**(있으면) `sugo_analyze` → **체인**(`sugo_chain`)으로 test-agent 인계.

**success:** 재현 테스트 red→green + 회귀 없음 + 체인. **on_failure:** 재현이 안 되면 정직히 밝히고
추가 정보를 요청한다(추측 수정 금지).
