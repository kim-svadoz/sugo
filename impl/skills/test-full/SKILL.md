---
name: test-full
description: test-agent 풀 스위트 스킬 — 전량 회귀 포함 전체 테스트를 풀검증 명령으로 돌리고 증거를 기록한다. 파이프라인 밖 "전체 테스트 돌려줘/full test/회귀 확인" 요청에도.
---

# test-full (test-agent)

targeted와 같은 규율(명세 기반·조작 방지 증거)이되 **전량**을 대상으로 한다.

1. **refs 로드** + (계약 필수) 계약테스트 test-first.
2. **전량 실행** — 프로젝트 전체 테스트를 **풀검증 명령**(`gradlew check`/`mvn verify|install`)으로 돌린다.
   단순 test는 §4.2에서 거부된다.
3. **분류** — 신규 실패=spec_not_met, 기존 실패=regression. 회귀는 원인을 밝힌다.
4. **증거 기록(필수)** — `sugo_record_test_evidence`(조작 방지 서버 기록).
5. **커버리지맵** — AC·응답필드 covered, 계약 red→green.

**success:** 전량 green + 증거 기록(풀검증 명령). **on_failure:** 실패를 정직히 기록(exitCode≠0인데
pass 주장 금지). 환경부재면 unverified로 명시(auto-loop 무한재시도 방지).
