---
name: test-full
agent: test-agent
description: 'test-agent 풀 스위트 스킬. 전량 회귀를 포함한 전체 테스트를 풀검증 명령으로 돌리고 증거를 기록한다. 파이프라인 밖의 "전체 테스트 돌려줘/full test/회귀 확인" 요청에도 쓴다.'
---

# test-full (test-agent)

테스트 코드의 주석과 이름은 `../../harness-library/code-quality-policy.md`의 공통 정책을 따른다.

targeted와 같은 규율(명세 기반, 조작 방지 증거)을 쓰되 대상이 전량이다.

1. refs를 로드한다. 파이프라인 안이고 계약이 필수인 세션이면, red는 이미 `contract_start`~
   `contract_done`(code_start 이전, 메인 에이전트 몫)에서 기록됐다 — 너는 같은 `contractId`로
   `sugo_record_contract_evidence(phase:"green", ...)`를 기록해 전이를 완성한다.
2. 전량 실행: 프로젝트 전체 테스트를 풀검증 명령(`gradlew check` 또는 `mvn verify|install`)으로
   돌린다. 단순 test는 §4.2에서 거부된다.
3. 분류: 신규 실패는 spec_not_met, 기존 실패는 regression으로 분류한다. 회귀는 원인을 밝힌다.
4. 증거 기록(필수): `sugo_record_test_evidence`로 남긴다. 서버가 조작을 막는다.
5. 커버리지맵: AC와 응답필드의 covered 여부, 계약의 red에서 green으로의 전이를 산출한다.

success: 전량 green과 풀검증 명령으로 남긴 증거 기록.
on_failure: 실패를 정직히 기록한다. exitCode가 0이 아닌데 pass를 주장하지 않는다. 환경이 없으면
unverified로 명시해 auto-loop 무한재시도를 막는다.

