---
description: 끝난 작업을 이어 후속 차수로 진행한다(§7.1 Patch). 기존 work-result.md 경로로 진입 — 원본 Run을 재사용하고 계보(lineage)를 대시보드로 전파한다.
argument-hint: <work-result.md 경로> [seed 지시]
---

너는 sugo **patch 후속 파이프라인**을 진행한다(§7.1). 인자: $ARGUMENTS

## 절차
1. `sugo_plan(action:"start", projectPath, featureName, workResultPath:<경로>, seed?)` — workResultPath가
   주어지면 patch 모드로 분기한다.
   - 부모 PRD: 같은 디렉터리 `prd.md` 우선, 없으면 `PRD-patch-v*.md` 최신본(둘 다 없으면 진입 불가).
   - 차수: `computeNextPatchVersion`으로 `(prd|work-result)-patch-vN.md` 최대값 +1.
2. 이후는 feat와 **동일한 코어 체인**(clarify→prd→…→commit). 단:
   - 1차 산출물을 덮지 않고 `PRD-patch-vN.md`/`work-result-patch-vN.md`로 **누적**한다.
   - patch는 원본 **Run을 재사용**하고 `patchInfo`(parentTaskId, patchVersion, seed)를 기록한다.
   - seed(사용자 지시)는 work-result에 "## 사용자 지시(seed)"로 실린다.
   - 계보(lineage)가 대시보드로 전파된다(§7.2).
3. 이번 차수는 **변경점만** 담은 하위 PRD로 좁힌다. 커밋타입·버전은 자동 판단.

## 규율
- work-result 경로가 없으면 이건 patch가 아니다 → `/sugo:feat`(신규)로 진행한다(100% 하위호환).
