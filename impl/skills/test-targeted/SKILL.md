---
name: test-targeted
description: test-agent 체인 기본 스킬 — code-agent 핸드오프+PRD 기반으로 이번 변경에 대한 테스트를 명세에서 도출한다. sugo_chain으로 CODE_DONE 후 진입. 테스트 파일만 수정.
---

# test-targeted (test-agent, 체인 기본)

**PRD(명세)에서 테스트를 도출하라** — 구현을 따라 짜면 순환검증(false-green).

0. **refs 로드** — 컨벤션·체크포인트·CLAUDE.md(`sugo_get_project_context`).
0.5. **(계약 필수) 계약테스트 test-first** — 구현 전 red 확인·기록(§4.1).
1. **회귀 baseline** — 기존 테스트 전량 실행. 기존 실패는 regression으로 분류·기록.
2. **핸드오프·PRD 확인** — prd_path로 PRD 열기(없으면 복구/fallback 라벨).
3. **명세에서 도출** — PRD의 AC마다 테스트, **응답 필드마다 어서션**, 통합레벨 ≥1.
4. **write/update** — 테스트 파일만.
5. **풀검증 실행** — `gradlew check`/`mvn verify|install`(단순 test는 §4.2에서 거부). 신규 실패=
   spec_not_met, 기존 실패=regression.
6. **증거 기록(필수)** — `sugo_record_test_evidence(command, exitCode, total, passed, failed)`.
7. **커버리지맵** — AC·응답필드 covered + (필수)계약 red→green을 산출(review_done이 소비).

**success:** test_done(pass) 게이트 통과. **on_failure:** 기록과 주장 불일치는 서버가 거부 — 실제
결과를 정직히 기록, 실패면 code-agent auto-loop 역행(≤3, NL feedback).
