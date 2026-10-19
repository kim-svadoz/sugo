---
name: review-validate
agent: review-agent
description: 'review-agent 체인 기본 스킬. validation.yaml checks[] 기반 하네스 규칙 검증(일부 서버 실측)과 work-result 리포트 생성. sugo_chain으로 TEST_DONE 후 진입한다. 읽기 전용이며 Edit/commit/push를 하지 않는다.'
---

# review-validate (review-agent, 체인 기본, 읽기 전용)

변경 diff의 주석과 이름은 `../../harness-library/code-quality-policy.md`의 공통 정책으로 검토한다.

코드를 고치지 않는다. 판정과 리포트만 한다.

1. 핸드오프 파싱: `sugo_chain`이 준 `handoff{project, changedFiles, changeType, summary, prdPath,
   sessionId}`(camelCase)를 확인한다.
2. 컨텍스트 로드: `sugo_get_project_context(projectPath, changedFiles)`로 규칙, 하네스, CLAUDE.md를
   읽는다. changedFiles를 넘기면 이번 변경에 해당하는 하네스만 실려 온다.
3. 적용 하네스 로드: 위에서 받은 하네스 본문을 기준으로 삼는다.
4. format/style 검증: 하네스가 요구하는 사항을 확인한다.
5. `sugo_validate(sessionId, validationResults)` 실행(**review_done 전 필수**): 적용된 하네스
   `validation.yaml`의 `checks[]`를 각각 `{harnessId, checkId, passed, note?}`로 판정해 제출한다.
   `auto` 선언이 있는 체크는 서버가 직접 실측하고 그 결과가 네 판정을 덮어쓴다(`source: verified`)
   — 확인하지 않은 항목을 통과로 올리지 않는다.
6. 결과 분석: `verified` 실패는 review_done을 실제로 막는다(`VALIDATE_VERIFIED_FAILURE`) — 여기서
   미리 고치고 재검증한다. `self-reported`는 네 판정 그대로 참고만 된다. `contradictions`에 주장과
   실측이 어긋난 항목이 남는다.
7. `sugo_check_lethal_trifecta(sessionId, tools)` 실행(**review_done 전 필수, opt-in
   아님**): `changedFiles`가 새로 건드린 도구 호출·MCP 서버·네트워크 호출·파일 읽기 경로를 훑어
   capability(사설데이터 접근/신뢰불가 입력 처리/외부통신)를 네가 직접 판단해 채운다(이름/설명에서
   자동 추측 금지). 경고(3축 동시 성립)가 있으면 `review_done`에 `trifectaMitigation`(완화 방법)을
   같이 실어야 한다.
8. work-result 입력(필수): 결과를 사실 중심의 한국어 `summary`로 정리한다(3줄 이상, 30자 이상,
   패딩 금지). 기본 표현은 **ASD-STE100 원칙 기반 한국어**다. 한 문장에는 한 주제나 한 행동만 쓰고,
   짧은 능동문과 일관된 용어를 사용한다. 상태→근거→행동→다음 단계 순서를 지키며 정식 STE
   준수라고 표시하지 않는다. 중요한 선택과 트레이드오프는 `reportDetails.designDecisions`, 남은 위험이나 제한은
   `reportDetails.knownLimitations`로 전달한다. 테스트 결과·변경 파일·요구사항 커버리지·하네스
   검증은 서버가 세션 증거에서 조립하며, `review_done`이 동일한 표준 리포트를 Markdown과
   Dashboard JSON으로 저장한다. 증거가 없는 성공을 직접 써 넣지 않는다.
9. 메인 복귀(스킵 금지): `runtimeCheck{buildAttempted,testRun,runtimeVerified}`와 metrics를 전달한다.

success: review_done의 게이트(validate 호출강제+실측, lethal-trifecta 호출강제+완화사유, 사용자
확인, summary 품질, 런타임 검증, 계약증거)에 필요한 근거를 모두 제공한 상태.
on_failure: **`sugo_validate`를 안 불렀으면 `VALIDATE_NOT_CALLED`로, 서버 실측 실패가 있으면
`VALIDATE_VERIFIED_FAILURE`로 review_done 자체가 막힌다** — 자기보고로 우길 수 없다. 자기보고만
실패한 경우(전체 verdict는 fail이어도 verified 아님)는 하드 게이트가 아니라서, `sugo_chain`으로
code-agent에 되돌릴지는 네 판단이다(재진입은 `autoLoopRetryCount`로 쌓이되 서버 강제 상한은 없다).
환경 부재가 아닌데 runtimeVerified=false를 주장하면 런타임 게이트가 따로 막는다. **`sugo_check_lethal_trifecta`를
안 불렀으면 `LETHAL_TRIFECTA_NOT_CALLED`로, 경고가 있는데 완화사유가 없으면
`LETHAL_TRIFECTA_MITIGATION_REQUIRED`로 review_done이 막힌다.**

**증거 스냅샷이 낡아 어떤 인자로도 안 통과할 때:** `test_done` 시점의 판정이
`testPassedState`로 박히고 이후 그린 증거를 다시 기록해도 갱신되지 않는다. 그래서
`runtimeVerified:true`는 `RUNTIME_CLAIM_CONTRADICTS_EVIDENCE`로, 라벨을 붙이면
`LABEL_CONTRADICTION`으로, 안 붙이면 `RUNTIME_UNVERIFIED_GATE_FAILED`로 — 세 길이 다 막히는
데드락이 생긴다(forward-only라 `test_done`으로 되돌아갈 수도 없다).

이때만 `sugo_plan(test_reverify, sessionId, reverifyReason)`으로 최신 증거를 다시 찍는다.
**먼저 올바른 그린 증거를 `sugo_record_test_evidence`로 기록해야 한다** — 최신 증거가 여전히
fail이면 `REVERIFY_EVIDENCE_STILL_FAIL`로 거부된다. 실패를 덮는 용도가 아니다. 재스냅샷은
`evidenceResnapshot` 라벨로 남아 완료등급이 `unverified`로 내려간다.

