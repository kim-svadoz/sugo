---
description: '끝난 작업을 이어 후속 차수로 진행한다(§7.1 Patch). 기존 work-result.md 경로로 진입해 원본 Run을 재사용하고 계보를 대시보드로 전파한다.'
argument-hint: <work-result.md 경로> [seed 지시]
---

너는 sugo patch 후속 파이프라인을 진행한다(§7.1). 인자: $ARGUMENTS

## 절차
1. `sugo_plan(action:"start", projectPath, featureName, workResultPath:<경로>, seed?)` — workResultPath가
   주어지면 patch 모드로 분기한다.
   - 부모 PRD: 같은 디렉터리 `prd.md` 우선, 없으면 `PRD-patch-v*.md` 최신본(둘 다 없으면 진입 불가).
   - 차수: `computeNextPatchVersion`으로 `(prd|work-result)-patch-vN.md` 최대값 +1.
2. 이후는 feat와 동일한 코어 체인(clarify→prd→…→commit). §4.3-T TODO-SPEC 게이트(`/sugo:feat`
   1·2·3·12번 참고)도 그대로 적용된다 — patch든 신규든 브랜치가 `feature/*`면 무조건이다. 단:
   - 1차 산출물을 덮지 않고 `PRD-patch-vN.md`/`work-result-patch-vN.md`로 누적한다.
   - patch는 원본 Run을 재사용하고 `patchInfo`(parentTaskId, patchVersion, seed)를 기록한다.
   - seed(사용자 지시)는 work-result에 "## 사용자 지시(seed)"로 실린다.
   - 계보(lineage)가 대시보드로 전파된다(§7.2).
   - review-agent가 근거를 반환하면 Claude 자체 선택창으로 확인을 묻지 않는다. 반드시
     `request_review_confirmation`으로 작업 요약과 변경 코드 아티팩트를 Dashboard에 먼저 게시한다.
     Dashboard의 `확인, 진행` 결정을 `resume_with_decision`으로 확인하기 전에는 `review_done`을 호출하지 않는다.
3. 이번 차수는 변경점만 담은 하위 PRD로 좁힌다. 커밋타입·버전은 자동 판단.

## 규율
- work-result 경로가 없으면 이건 patch가 아니다 → `/sugo:feat`(신규)로 진행한다(100% 하위호환).
- 구현·검증 중 사람의 정책 판단이 필요하면 `/sugo:feat`의 **사람 판단 차단 계약**을 그대로 따른다.
  patch도 원본 Task와 현재 `sessionId`로 `block_for_human`을 기록하고, Dashboard 결정은
  `resume_with_decision`으로 검증한 뒤 같은 patch 세션의 `resumeAction`으로 돌아간다.
