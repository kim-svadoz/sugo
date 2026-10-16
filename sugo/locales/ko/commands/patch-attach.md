---
description: '현재 대화에서 이미 수행한 변경을 기존 Sugo 작업의 다음 검증된 patch로 사후 편입합니다.'
argument-hint: <work-result.md 경로> [사용자 의도]
---

# Patch 사후 연결

현재 세션에서 이미 수행한 변경을 기존 Sugo 계보에 연결합니다.

1. 연결할 기존 work-result를 확정합니다. 모호하면 사용자에게 선택을 요청하며 추측하지 않습니다.
2. 현재 대화, Git 상태, diff와 이력을 읽어 실제 변경 목적을 정리합니다.
3. `sugo_plan(action:"start", projectPath, featureName, workResultPath, seed, patchProvenance:"captured-post-hoc", postHocBaseRevision?)`를 호출합니다. 커밋 전 변경은 서버가 HEAD를 기준선으로 기록합니다. 이미 커밋한 변경은 변경 전 revision을 전달합니다. 이후 일반 `/sugo:patch`와 같은 전체 파이프라인과 게이트를 실행합니다.
4. 서버가 산출물에 `captured-post-hoc` 출처와 Git 기준선을 기록합니다. 관찰하지 못한 과거 증거는 만들지 않습니다.
5. Git 기준점을 확정할 수 없으면 `POST_HOC_BASELINE_REQUIRED`로 중단합니다.
