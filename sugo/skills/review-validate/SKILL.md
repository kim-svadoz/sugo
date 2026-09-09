---
name: review-validate
description: 'review-agent 체인 기본 스킬. validation.yaml 기반 하네스 규칙 검증과 work-result 리포트 생성. sugo_chain으로 TEST_DONE 후 진입한다. 읽기 전용이며 Edit/commit/push를 하지 않는다.'
---

# review-validate (review-agent, 체인 기본, 읽기 전용)

코드를 고치지 않는다. 판정과 리포트만 한다.

1. 컨텍스트 로드: `sugo_get_project_context`로 규칙, 하네스, CLAUDE.md를 읽는다.
2. 핸드오프 파싱: changed_files, summary, prd_path를 확인한다.
3. 적용 하네스 로드: `sugo/harness/**` 규칙을 읽는다.
4. format/style 검증: 하네스가 요구하는 사항을 확인한다.
5. `sugo_validate` 실행: validation.yaml(build/test/lint/typecheck/security/custom)과 thresholds,
   drift_checks를 돌린다. on_failure와 auto_fix 정책을 따른다.
6. 결과 분석: 하네스 위반과 실패 임계를 판정한다.
7. work-result 리포트(필수): 배경, 변경, 설계, 테스트를 한국어로 저장한다(3줄 이상, 30자 이상,
   패딩 금지). review_done의 summary 게이트가 이 값을 근거로 삼는다.
8. 메인 복귀(스킵 금지): `runtimeCheck{buildAttempted,testRun,runtimeVerified}`와 metrics를 전달한다.

success: review_done 4중 게이트에 필요한 근거를 모두 제공한 상태.
on_failure: 위반이나 임계 초과가 있으면 code-agent로 auto-loop 역행한다(3회 이하,
reviewLoopRetryCount). 환경 부재가 아닌데 runtimeVerified=false를 주장하면 게이트가 막는다.
