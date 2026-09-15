---
name: review-validate
description: 'review-agent 체인 기본 스킬. validation.yaml checks[] 기반 하네스 규칙 검증(일부 서버 실측)과 work-result 리포트 생성. sugo_chain으로 TEST_DONE 후 진입한다. 읽기 전용이며 Edit/commit/push를 하지 않는다.'
---

# review-validate (review-agent, 체인 기본, 읽기 전용)

코드를 고치지 않는다. 판정과 리포트만 한다.

1. 핸드오프 파싱: `sugo_chain`이 준 `handoff{project, changedFiles, changeType, summary, prdPath,
   sessionId}`(camelCase)를 확인한다.
2. 컨텍스트 로드: `sugo_get_project_context(projectPath, changedFiles)`로 규칙, 하네스, CLAUDE.md를
   읽는다. changedFiles를 넘기면 이번 변경에 해당하는 하네스만 실려 온다.
3. 적용 하네스 로드: 위에서 받은 하네스 본문을 기준으로 삼는다.
4. format/style 검증: 하네스가 요구하는 사항을 확인한다.
5. `sugo_validate(sessionId, validationResults)` 실행(**review_done 전 필수**): 적용된 하네스
   `validation.yaml`의 `checks[]`를 각각 `{harnessId, checkId, passed, note?}`로 판정해 제출한다.
   `auto` 선언이 있는 체크는 서버가 직접 실측하고 그 결과가 네 판정을 덮어쓴다(`source: verified`)
   — 확인하지 않은 항목을 통과로 올리지 않는다.
6. 결과 분석: `verified` 실패는 review_done을 실제로 막는다(`VALIDATE_VERIFIED_FAILURE`) — 여기서
   미리 고치고 재검증한다. `self-reported`는 네 판정 그대로 참고만 된다. `contradictions`에 주장과
   실측이 어긋난 항목이 남는다.
7. work-result 리포트(필수): 배경, 변경, 설계, 테스트를 한국어로 저장한다(3줄 이상, 30자 이상,
   패딩 금지). review_done의 summary 게이트가 이 값을 근거로 삼는다.
8. 메인 복귀(스킵 금지): `runtimeCheck{buildAttempted,testRun,runtimeVerified}`와 metrics를 전달한다.

success: review_done의 게이트(validate 호출강제+실측, 사용자 확인, summary 품질, 런타임 검증,
계약증거)에 필요한 근거를 모두 제공한 상태.
on_failure: **`sugo_validate`를 안 불렀으면 `VALIDATE_NOT_CALLED`로, 서버 실측 실패가 있으면
`VALIDATE_VERIFIED_FAILURE`로 review_done 자체가 막힌다** — 자기보고로 우길 수 없다. 자기보고만
실패한 경우(전체 verdict는 fail이어도 verified 아님)는 하드 게이트가 아니라서, `sugo_chain`으로
code-agent에 되돌릴지는 네 판단이다(재진입은 `autoLoopRetryCount`로 쌓이되 서버 강제 상한은 없다).
환경 부재가 아닌데 runtimeVerified=false를 주장하면 런타임 게이트가 따로 막는다.
