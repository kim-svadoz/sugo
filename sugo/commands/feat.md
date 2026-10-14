---
description: 'sugo 핵심 파이프라인. 기능 한 건을 PRD에서 커밋까지 code, test, review, docs, commit 순서의 강제 상태머신으로 몰아간다. 각 전이는 게이트가 실행 증거로만 통과시킨다.'
argument-hint: [--project <path>] [--spec <spec.md>] [--spec-draft <id>] [--branch <name>] <기능 설명>
---

너는 sugo의 feat 파이프라인을 진행한다. `sugo_plan` 상태머신을 스펙 §3 순서대로 몰아가되 게이트를
약화시키지 않는다. 통과는 실행 증거로만 하고 우회는 명시적인 미검증 라벨로만 한다.

요청: $ARGUMENTS

Dashboard에서 복사한 명령이면 `--project`, `--spec`, `--spec-draft`, `--branch`를 정확히 파싱해 첫
`sugo_plan(action:"start")` 호출에 각각 `projectPath`, `specPath`, `specDraftId`, `workBranch`로 전달한다.
이 경로에서는 사용자가 Schedule에서 이미 특정 초안을 선택했으므로 다른 미연결 초안 선택 질문을 반복하지 않는다.

## 절차

`sugo_plan` action을 순서대로 호출하고, 각 결과의 nextActionHints를 따라간다.

1. `sugo_plan(action:"start", projectPath, featureName, specPath?, specDraftId?, workBranch?)`으로 등록을 확인하고 세션을 만든다.
   `workBranch`가 있으면 Sugo가 원격을 fetch한 뒤 작업 브랜치를 준비한다. 변경 중인 파일이 있거나
   로컬과 원격 이력이 갈라지면 자동 병합하지 말고 에러를 그대로 보고한다.
   workResultPath를 주면 patch로 분기한다(`/sugo:patch` 참고).
   - **§4.3-T TODO-SPEC(하드 게이트, 브랜치 패턴이면 무조건 — opt-in 아님)**: 응답의 `todoSpec`을
     본다. `status:"missing"`이면 아직 파일이 없다는 뜻이니 2번에서 최종 목표를 확정해야 한다.
     `status:"loaded"`면 `content`(원문, 요약 아님)를 그대로 읽어 "완료됨"/"남은 것"을 파악하고,
     이번 요청이 남은 항목 중 어디에 해당하는지 사용자와 짧게 맞춘다. `todoSpec` 필드 자체가
     없으면(undefined) `feature/*` 브랜치가 아니라는 뜻이라 이 절차 전체를 건너뛴다.
   - `otherResumableSessions`가 있으면 같은 프로젝트에 막혀 있는 다른 세션이 있다는 뜻이다.
     자동으로 병합하지 말고 사용자에게 "이 세션을 이어받을지, 새로 시작할지" 물어본다.
   - `unlinkedSpecDrafts`가 있으면 Schedule에서 먼저 만든 미연결 최상위 SPEC 초안이다. **반드시**
     제목·마감일을 사용자에게 보여주고, 하나에 연결할지 새 SPEC을 만들지 물어본다. 선택 전에는
     `clarify`가 `SPEC_DRAFT_SELECTION_REQUIRED`로 차단된다. 기존 초안이면
     `clarify(specDraftDecision:"link", specDraftId)`, 새 SPEC이면 `clarify(specDraftDecision:"new")`로
     기록한다. 에이전트가 제목 유사도로 자동 선택하면 안 된다.
2. `clarify`로 범위, 수락기준, 제약, 우선순위를 사용자와 확정한다.
   - TODO-SPEC이 `missing`이었다면: 사용자의 요청을 이번 세션 범위로 축소하지 말고, 그 요청이
     암시하는 **최종 완성형**부터 먼저 사용자와 확정한다. 확정된 목록만
     `clarify(todoSpecGoal, todoSpecItems, todoSpecUserConfirmed:true)`로 넘긴다 —
     **`todoSpecUserConfirmed`가 없으면 서버가 `TODO_SPEC_DRAFT_CONFIRMATION_REQUIRED`로 막는다.**
     모델이 임의로 목록을 확정해 파일로 고정하지 않는다(고정되면 이후 모든 세션이 잘못된
     전제로 동작한다).
3. `prd`로 PRD를 저장한다. 게이트 통과 조건은 **본문 100자 이상 + `REQ-N` 태그 1개 이상**(어디에
   있든 인정, 헤딩 아니어도 됨)뿐이다. baseline 시그널 판정과 HULK Task/Run 생성이 함께 일어난다.
   **Roadmap REQ 노드 심기는 별개로, `### REQ-N: 제목` 마크다운 헤딩 형식만 인식하는 더 엄격한
   계약이다** — 헤딩이 없으면 PRD는 정상 통과하지만 Roadmap에는 조용히 아무것도 안 심긴다(에러
   아님). Roadmap 추적이 필요하면 REQ를 헤딩으로 쓴다.
   TODO-SPEC이 있는 브랜치라면 REQ 태그 옆에 "TODO-SPEC 항목: b" 식으로 참조를 남긴다 — 강제
   게이트는 아니고, 나중에 사람이 PRD와 TODO-SPEC을 대조할 때 도움을 주는 정도다.
   원본 SPEC에 기획 화면 이미지(`![...](images/...)`)가 있으면 PRD에 "기획 화면" 섹션을 두고 spec.md 기준으로
   풀어 쓴 **절대 경로** 링크로 모두 옮긴다. PRD는 다른 위치에 저장되므로 상대경로를 그대로 쓰면 깨진다.
4. PRD가 비대하면 `decompose` 후 `subtask_start`와 `subtask_done`을 거쳐 `integrate`로 간다.
   아니면 `ready`로 간다.
5. `baseline_capture`: §4.0 시그널(런타임이나 JDK 상향, 의존성 제거)이 있으면 코딩 전에 그린
   baseline이 필수다.
6. `contract_start` 후 `contract_done`: **이 단계는 code-agent가 아니라 네(메인 에이전트) 몫이다**
   — `code_start`보다 앞서는 상태라 아직 서브에이전트를 안 띄웠다. 계약테스트를 test-first로 쓰고
   `sugo_record_contract_evidence(sessionId, contractId, phase:"red", command, exitCode)`로 구현 전
   실패를 직접 기록한다. 테스트가 불가능하면 라벨을 붙인다. green은 나중에 test-agent가 같은
   `contractId`로 기록해 red→green 전이를 완성한다(§10).
7. `code_start`로 code-agent를 띄운다. 하네스 도구 메뉴가 주입된다.
8. `code_done`: code-agent가 `sugo_analyze`를 실제로 호출한 뒤에 넘어간다(§4.1의 analyze, baseline,
   wiring, glue, boot 다중 게이트).
9. `test_start`에서 test-agent로 넘기고(`sugo_chain`으로 인계 — 관례이지 서버가 강제하진 않는다,
   `test_start`/`review_start` 둘 다 게이트가 비어 있다) `test_done`에서 풀검증 명령 증거를
   대조한다(§4.2).
10. `review_start`에서 review-agent(읽기 전용)로 넘기고 `review_done`에서 게이트를 통과한다:
    `sugo_validate` 호출강제 + 서버 실측 우선, 사용자 확인, summary 품질, 런타임 검증,
    계약증거(§4.3). PRD 커버리지는 `test_done`의 opt-in 게이트다(review_done이 아님). 여기서
    REQ와 REQ-CONFIRM이 자동 완료된다.
    - review-agent가 근거를 반환하면 터미널에 긴 결과를 펼쳐 확인을 묻지 않는다.
      `sugo_roadmap(action:"request_review_confirmation", workspace, id, sessionId, reviewPacket)`으로
      Dashboard에 게시한다. 사용자는 Schedule 상세 또는 Agent Canvas의 Task Inspector에서 본다.
    - Dashboard 결정을 `resume_with_decision`으로 검증한다. `확인, 진행`이면 `review_done`을 호출한다.
      `수정 필요`이면 review_done을 호출하지 않고 해당 내용을 code-agent에 전달한다.
11. `docs_done`: docs-agent로 README 등을 갱신한다.
12. `commit`: DONE에서만 커밋을 생성한다(§6, 2커밋 분리, push 금지). 커밋 전에 체크포인트를 확인한다.
    커밋 메시지에는 `Co-Authored-By` trailer를 추가하지 않으며 Claude·Codex 등 AI 도구나 모델을 공동저자로 기록하지 않는다.
    - **§4.3-T TODO-SPEC 동기화(하드 게이트)**: TODO-SPEC이 있는 브랜치인데 세션 시작 이후 파일이
      전혀 안 바뀌었으면 서버가 `TODO_SPEC_SYNC_REQUIRED`(또는 파일 자체가 없으면
      `TODO_SPEC_MISSING_AT_COMMIT`)로 `sugo_plan(commit)`을 막는다. **막히면 실제 git commit을
      실행하지 않는다** — 이 세션이 다룬 항목을 TODO-SPEC의 "완료됨"으로 체크하거나, 새로 발견된
      잔여 항목을 "남은 것"에 추가한 뒤 다시 시도한다. 정말 이 세션이 TODO-SPEC과 무관했다면(예:
      핫픽스) `todoSpecSyncReason`으로 사유를 남기고 넘어간다 — 완료등급이 unverified로 낮아진다.

## 규율

- 상태를 건너뛰려 하지 않는다. 서버가 `GATE_KEEPER_BLOCKED`로 막는다.
- 게이트가 막으면 에러코드를 사용자에게 그대로 전하고 실제로 충족시킨다. 라벨로 도망치지 않는다.
- 환경 부재는 명시 라벨로만 쓴다. 남용하면 완료등급이 강등된다(§4.6).
- 진행 상황은 대시보드로 논블로킹 미러링된다. 대시보드가 다운돼도 파이프라인은 막히지 않는다.

### 사람 판단 차단 계약

- 테스트 실패, review 미통과, 실행증거 부족처럼 에이전트가 직접 해결할 수 있는 게이트는
  대시보드에 사람 차단으로 올리지 않는다. 원인을 고치고 같은 action을 다시 시도한다.
- analyze의 `partial`/`fail`은 PRD 단어와 코드 문자열의 겹침을 보여주는 비차단 진단이다. 이를
  통과시키려고 주석·이름을 바꾸거나 반복 호출하지 않는다.
- PRD 이후 구현·검증 중 정책/범위/권한처럼 **사람만 결정할 수 있는 미확정 사항**이 발견되면
  임의로 추측하지 않는다. 현재 `hulkWorkspace`와 `hulkTaskId`를 사용해
  `sugo_roadmap(action:"block_for_human", workspace, id, sessionId, stage, resumeAction,
  blockerSummary, question, context, options, blockedNextStep)`를 호출한다. 질문 한 줄만 보내지 말고
  무엇을 하다 멈췄는지, 판단 근거, 선택지별 영향을 모두 채운 뒤 작업을 멈춘다.
- 사용자가 Dashboard에서 결정을 저장하고 복사한 재개 프롬프트로 돌아오면 반드시 먼저
  `sugo_roadmap(action:"resume_with_decision", workspace, id, sessionId)`을 호출한다. 서버가 돌려준
  결정과 `resumeAction`을 확인한 뒤 **같은 `sugo_plan` sessionId**에서 해당 action을 다시 진행한다.
  대시보드에 답이 없거나 sessionId가 다르면 재개하지 않는다.
- start~clarify처럼 아직 Task가 생기기 전이고 현재 대화에서 즉시 답할 수 있는 질문은 기존처럼
  대화에서 묻는다. 존재하지 않는 임시 Task를 만들어 Dashboard 차단처럼 꾸미지 않는다.
