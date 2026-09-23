---
name: test-targeted
agent: test-agent
description: 'test-agent 체인 기본 스킬. code-agent 핸드오프와 PRD를 근거로 이번 변경에 대한 테스트를 명세에서 도출한다. sugo_chain으로 CODE_DONE 후 진입한다. 테스트 파일만 수정한다.'
---

# test-targeted (test-agent, 체인 기본)

테스트는 PRD(명세)에서 도출한다. 구현을 따라 짜면 순환검증이 되어 false-green이 나온다.

0. refs 로드: `sugo_chain`이 준 `handoff{project, changedFiles, changeType, summary, prdPath,
   sessionId}`(camelCase)를 확인하고, `sugo_get_project_context`로 컨벤션·체크포인트·CLAUDE.md를
   읽는다.
0.5. 계약테스트 green 기록(계약 필수일 때): red는 네 차례가 아니다 — `contract_start`~
     `contract_done`(code_start 이전, 메인 에이전트 몫)에서 이미 기록됐다. 같은 `contractId`로
     `sugo_record_contract_evidence(phase:"green", ...)`를 호출해 전이를 완성한다.
1. 회귀 baseline: 기존 테스트를 전량 실행한다. 기존 실패는 regression으로 분류해 기록한다.
2. PRD 확인: `handoff.prdPath`로 PRD를 연다. 없으면 복구하거나 fallback 라벨을 붙인다.
3. 명세에서 도출: PRD의 AC마다 테스트를 만들고 응답 필드마다 어서션을 넣는다. 통합레벨은 1개 이상.
4. write/update: 테스트 파일만 수정한다.
5. 풀검증 실행: `gradlew check` 또는 `mvn verify|install`을 쓴다. 단순 test는 §4.2에서 거부된다.
   신규 실패는 spec_not_met, 기존 실패는 regression으로 분류한다.
6. 증거 기록(필수): `sugo_record_test_evidence(sessionId, command, exitCode, totalTests, passedTests,
   failedTests)`(구 이름 `total/passed/failed`는 하위호환용 deprecated).
7. 커버리지맵: AC와 응답필드의 covered 여부, 계약이 필수면 red에서 green으로의 전이를 산출한다.
   review_done이 이 값을 소비한다.

success: test_done(pass) 게이트 통과.
on_failure: 기록과 주장이 다르면 서버가 거부한다(`checkTestEvidenceGate`). 실제 결과를 정직히
기록하고, 실패면 `sugo_chain`으로 code-agent에 역행한다(재진입은 `autoLoopRetryCount`로 쌓이되
서버 강제 상한은 없다 — 무한 반복하지 않는다는 판단은 네 몫).
