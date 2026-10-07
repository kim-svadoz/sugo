---
name: bugfix
agent: code-agent
description: 'code-agent 버그 수정 스킬. 재현 테스트를 먼저 쓰고 고친다. "버그/에러/안 돼/고쳐줘/bug/fix/broken" 요청에 쓴다(negative: 테스트만/문서/리팩토링). sugo_route가 이 스킬로 보낸다.'
---

# bugfix (code-agent)

코드 주석과 이름은 `../../harness-library/code-quality-policy.md`의 공통 정책을 따른다.

재현 없이 고치지 않는다. 순서를 지키는 것이 이 스킬의 요점이다.

1. 재현: 버그를 드러내는 실패하는 테스트를 먼저 작성한다(red 고정). 재현이 안 되면 원인부터 좁힌다.
2. 컨텍스트: `sugo_get_project_context`와 `sugo_explore`로 관련 코드를 이해한다.
3. 수정: 최소 변경으로 근본 원인을 고친다. 증상만 덮지 않는다.
4. 검증: 1의 재현 테스트가 green으로 바뀌고 기존 스위트가 계속 green인지 확인한다.
5. PRD 교차검증(있으면) `sugo_analyze` 후 `sugo_chain`으로 test-agent에 인계한다.

success: 재현 테스트가 red에서 green으로 바뀌고 회귀가 없으며 체인까지 마친 상태.
on_failure: 재현이 안 되면 정직히 밝히고 추가 정보를 요청한다. 추측으로 고치지 않는다.
