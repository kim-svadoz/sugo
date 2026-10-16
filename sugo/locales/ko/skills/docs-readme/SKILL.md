---
name: docs-readme
agent: docs-agent
description: 'docs-agent 기본 스킬. 변경파일과 summary로 README의 해당 섹션을 갱신한다. 정확성이 최우선이며 코드와 문서가 어긋나면 안 된다. DOCS_PENDING에서 진입해 완료 후 docs_done으로 넘어간다. 문서 파일만 수정한다.'
---

# docs-readme (docs-agent)

문서의 코드 예제는 `../../harness-library/code-quality-policy.md`의 공통 정책을 따른다.

정확성이 최우선이다. 코드에 없는 것을 문서에 쓰지 않는다. 문서가 없는 것보다 틀린 문서가 나쁘다.

1. 컨텍스트 확보: `sugo_chain`은 code→test/test→review 두 방향뿐이라 이 에이전트는 구조화된
   핸드오프를 받지 않는다(도구 목록에도 없음). 메인 에이전트가 작업 지시에 담아준 변경 파일·요약을
   쓰거나, `sugo_plan(action:"status", sessionId)`의 `workResultPath`로 work-result.md를 직접 읽는다.
2. README와 관련 문서에서 해당 섹션만 실제 변경에 맞춰 갱신한다.
3. 코드와 대조해 정확성을 확인한다. 추측으로 쓰지 않는다.
4. 완료되면 `sugo_plan(docs_done)`으로 COMMIT_PENDING으로 진행한다.

success: 문서가 변경을 정확히 반영한 상태.
on_failure: 변경 대상이 불명확하면 사용자에게 확인한다.

