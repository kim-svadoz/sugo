---
description: sugo 핵심 파이프라인 — 기능 한 건을 PRD→커밋까지 code→test→review→docs→commit 강제 상태머신으로 몰아간다. 각 전이는 게이트가 실행 증거로만 통과시킨다.
argument-hint: <기능 설명>
---

너는 sugo의 **feat 파이프라인**을 진행한다. `sugo_plan` 상태머신을 스펙 §3 순서대로 몰아가되,
**게이트를 절대 약화시키지 마라** — 통과는 실행 증거로만, 우회는 명시적 '미검증' 라벨로만.

요청: $ARGUMENTS

## 절차 (sugo_plan action을 순서대로 호출; 각 결과의 nextActionHints를 따라간다)
1. `sugo_plan(action:"start", projectPath, featureName)` — 등록 확인·세션 생성.
   (workResultPath를 주면 patch 분기 → `/sugo:patch` 참고.)
2. `clarify` — 범위·수락기준·제약·우선순위를 사용자와 확정.
3. `prd` — PRD 저장(≥100자, 요구 ≥1개, `### REQ-XXX:` 헤딩). baseline 시그널 판정 + HULK Task+Run
   생성 + Roadmap REQ 노드 심기가 함께 일어난다.
4. (비대 PRD면) `decompose`→`subtask_start`/`subtask_done`→`integrate`. 아니면 `ready`.
5. `baseline_capture` — §4.0 시그널(런타임/JDK 상향·의존성 제거)이 있으면 코딩 전 그린 baseline 필수.
6. `contract_start`→`contract_done` — 계약테스트 test-first(구현 전 red 확인). 테스트 불가면 라벨.
7. `code_start` — **code-agent**를 띄운다(하네스 도구 메뉴가 주입된다). 구현 후:
8. `code_done` — code-agent가 `sugo_analyze`를 실제 호출한 뒤(§4.1 다중 게이트: analyze/baseline/
   wiring/glue/boot).
9. `test_start` → **test-agent**(sugo_chain 필수) → `test_done` — 풀검증 명령 증거 대조(§4.2).
10. `review_start` → **review-agent**(읽기전용) → `review_done` — 4중 게이트: 사용자확인+summary품질+
    런타임검증+PRD커버리지(§4.3). 여기서 REQ/REQ-CONFIRM 자동완료.
11. `docs_done` — **docs-agent**로 README 등 갱신.
12. `commit` — DONE에서만 커밋 생성(§6, 2커밋 분리, push 금지). 커밋 전 체크포인트 확인.

## 규율
- 상태를 건너뛰려 하지 마라 — 서버가 `GATE_KEEPER_BLOCKED`로 막는다.
- 게이트가 막으면 이유(에러코드)를 사용자에게 그대로 전하고 **실제로 충족**시켜라. 라벨로 도망치지 마라.
- 환경 부재는 명시 라벨로만(남용하면 완료등급 강등, §4.6).
- 진행은 대시보드로 논블로킹 미러링된다(대시보드 다운이 파이프라인을 막지 않는다).
