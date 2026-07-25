---
description: review 단계 하네스 규칙 검증을 돌린다(validation.yaml: build/test/lint/typecheck/security/custom).
argument-hint: [projectPath]
---

너는 하네스 규칙 검증을 실행한다(§5). 인자: $ARGUMENTS

## 절차
- `sugo_validate(projectPath)`로 `sugo/harness/<id>/validation.yaml`의 `required_gates`
  (build|test|lint|typecheck|security|custom)와 thresholds·custom_rules·drift_checks를 실행한다.
- `on_failure`(abort|warn|continue)와 게이트별 `auto_fix`(self-heal 후 재시도) 정책을 따른다.
- 파이프라인 안에서는 review-agent가 review_start 후 이걸 돌린다(읽기 전용). 결과는 work-result 리포트에 담는다.

## 규율
- 실패면 auto-loop로 code-agent 역방향 재실행(≤3, reviewLoopRetryCount).
- validate는 판정만 한다 — 여기서 코드를 고치지 마라(고치는 건 code-agent).
