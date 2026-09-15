---
description: 'review 단계 하네스 규칙 검증을 돌린다(validation.yaml checks[], 일부는 서버 실측).'
argument-hint: "[projectPath]"
---

너는 하네스 규칙 검증을 실행한다(§5). 인자: $ARGUMENTS

## 절차
- `sugo_validate(sessionId, validationResults)`를 호출한다. `validationResults`는 프로젝트에 적용된
  하네스의 `validation.yaml` `checks[]`(`{id, description, severity}`)에 대해 review-agent가 직접
  판정한 `{harnessId, checkId, passed, note?}` 목록이다.
- 체크에 `auto` 선언이 있으면(파일 존재/부재, 내용 패턴, tsconfig 필드 등) **서버가 직접 실측하고
  그 결과가 네 판정을 덮어쓴다.** 응답의 각 결과에 `source: "verified" | "self-reported"`가 붙는다 —
  `verified`는 서버가 확인한 사실, `self-reported`는 네 주장 그대로다. 주장과 실측이 어긋나면
  `contradictions`에 남는다(확인 안 한 항목을 통과로 올리지 않는다).
- 존재하지 않는 checkId를 보고하면 `fabricated`로 분리돼 판정에서 빠진다.
- 파이프라인 안에서는 review-agent가 review_start 후 이걸 돌린다(읽기 전용). 결과는 work-result
  리포트에 담는다.

## 규율
- `verified` 실패는 논쟁 대상이 아니라 고쳐야 할 사실이다. `self-reported`는 확인 안 한 항목을
  통과라고 우기지 않는다.
- validate는 판정만 한다 — 여기서 코드를 고치지 마라(고치는 건 code-agent). 실패가 재작업으로
  이어질 땐 `sugo_chain`으로 되돌리되, 재진입 횟수는 세션에 `autoLoopRetryCount`로 쌓인다(하드
  캡 없음 — 판단품질 리포트의 근거 지표일 뿐, 무한 반복하지 않는다는 판단은 에이전트 몫).
- **아직 `review_done`을 막는 하드 게이트로 승격되지 않았다.** 실패를 보고해도 파이프라인은
  진행된다 — `verified` 커버리지가 낮은 채로 게이트를 걸면 "막는 척"이 되기 때문이다.
