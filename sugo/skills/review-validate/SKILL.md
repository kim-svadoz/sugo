---
name: review-validate
description: review-agent 체인 기본 스킬 — validation.yaml 기반 하네스 규칙 검증 + work-result 리포트 생성. sugo_chain으로 TEST_DONE 후 진입. 읽기 전용(Edit/commit/push 금지).
---

# review-validate (review-agent, 체인 기본, 읽기 전용)

**절대 코드를 고치지 마라.** 판정과 리포트만 한다.

1. **컨텍스트 로드** — `sugo_get_project_context`(규칙·하네스·CLAUDE.md).
2. **핸드오프 파싱** — changed_files/summary/prd_path.
3. **적용 하네스 로드** — `sugo/harness/**` 규칙.
4. **format/style 검증** — 하네스 요구 확인.
5. **`sugo_validate` 실행** — validation.yaml(build/test/lint/typecheck/security/custom) + thresholds +
   drift_checks. on_failure/auto_fix 정책 준수.
6. **결과 분석** — 하네스 위반·실패 임계 판정.
7. **work-result 리포트(필수)** — 배경/변경/설계/테스트(한국어, ≥3줄·≥30자, 패딩 금지)를 저장.
   이게 review_done summary 게이트 근거.
8. **메인 복귀(스킵 금지)** — `runtimeCheck{buildAttempted,testRun,runtimeVerified}` + metrics 전달.

**success:** review_done 4중 게이트 근거 제공. **on_failure:** 위반/임계 초과면 code-agent auto-loop
역행(≤3, reviewLoopRetryCount). runtimeVerified=false를 환경부재 아닌데 주장하면 게이트가 막는다.
