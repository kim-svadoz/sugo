---
description: 'sugo 핵심 파이프라인. 기능 한 건을 PRD에서 커밋까지 code, test, review, docs, commit 순서의 강제 상태머신으로 몰아간다. 각 전이는 게이트가 실행 증거로만 통과시킨다.'
argument-hint: <기능 설명>
---

너는 sugo의 feat 파이프라인을 진행한다. `sugo_plan` 상태머신을 스펙 §3 순서대로 몰아가되 게이트를
약화시키지 않는다. 통과는 실행 증거로만 하고 우회는 명시적인 미검증 라벨로만 한다.

요청: $ARGUMENTS

## 절차

`sugo_plan` action을 순서대로 호출하고, 각 결과의 nextActionHints를 따라간다.

1. `sugo_plan(action:"start", projectPath, featureName)`으로 등록을 확인하고 세션을 만든다.
   workResultPath를 주면 patch로 분기한다(`/sugo:patch` 참고).
2. `clarify`로 범위, 수락기준, 제약, 우선순위를 사용자와 확정한다.
3. `prd`로 PRD를 저장한다(100자 이상, 요구 1개 이상, `### REQ-XXX:` 헤딩). baseline 시그널 판정과
   HULK Task/Run 생성, Roadmap REQ 노드 심기가 함께 일어난다.
4. PRD가 비대하면 `decompose` 후 `subtask_start`와 `subtask_done`을 거쳐 `integrate`로 간다.
   아니면 `ready`로 간다.
5. `baseline_capture`: §4.0 시그널(런타임이나 JDK 상향, 의존성 제거)이 있으면 코딩 전에 그린
   baseline이 필수다.
6. `contract_start` 후 `contract_done`: 계약테스트를 test-first로 쓰고 구현 전 red를 확인한다.
   테스트가 불가능하면 라벨을 붙인다.
7. `code_start`로 code-agent를 띄운다. 하네스 도구 메뉴가 주입된다.
8. `code_done`: code-agent가 `sugo_analyze`를 실제로 호출한 뒤에 넘어간다(§4.1의 analyze, baseline,
   wiring, glue, boot 다중 게이트).
9. `test_start`에서 test-agent로 넘기고(`sugo_chain` 필수) `test_done`에서 풀검증 명령 증거를
   대조한다(§4.2).
10. `review_start`에서 review-agent(읽기 전용)로 넘기고 `review_done`에서 게이트를 통과한다:
    `sugo_validate` 호출강제 + 서버 실측 우선, 사용자 확인, summary 품질, 런타임 검증,
    계약증거(§4.3). PRD 커버리지는 `test_done`의 opt-in 게이트다(review_done이 아님). 여기서
    REQ와 REQ-CONFIRM이 자동 완료된다.
11. `docs_done`: docs-agent로 README 등을 갱신한다.
12. `commit`: DONE에서만 커밋을 생성한다(§6, 2커밋 분리, push 금지). 커밋 전에 체크포인트를 확인한다.

## 규율

- 상태를 건너뛰려 하지 않는다. 서버가 `GATE_KEEPER_BLOCKED`로 막는다.
- 게이트가 막으면 에러코드를 사용자에게 그대로 전하고 실제로 충족시킨다. 라벨로 도망치지 않는다.
- 환경 부재는 명시 라벨로만 쓴다. 남용하면 완료등급이 강등된다(§4.6).
- 진행 상황은 대시보드로 논블로킹 미러링된다. 대시보드가 다운돼도 파이프라인은 막히지 않는다.
