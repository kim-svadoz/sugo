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
- validate는 판정만 한다 — 여기서 코드를 고치지 마라(고치는 건 code-agent).
- **`review_done`은 이 도구를 두 겹으로 강제한다.** 호출 자체를 안 했으면 `VALIDATE_NOT_CALLED`,
  호출은 했는데 `auto` 실측이 실패로 확인된 게 있으면 `VALIDATE_VERIFIED_FAILURE`로 막힌다 —
  둘 다 review_done 전에 여기서 미리 잡고 code-agent로 돌려 고치는 게 낫다.
- **자기보고 실패는 하드 게이트가 아니다.** 91%는 여전히 자기보고라, 커버리지가 낮은 채로 전체
  verdict를 하드 게이트로 걸면 "막는 척"이 된다 — `verified`로 확인된 것만 막는다. 자기보고만
  실패했을 때 재작업으로 돌릴지는 판단 몫이고, 재진입 횟수는 `autoLoopRetryCount`로 쌓인다(하드
  캡 없음).
