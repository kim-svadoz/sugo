---
description: '현재 대화에서 이미 수행한 변경을 기존 Sugo 작업의 다음 검증된 patch로 사후 편입합니다.'
argument-hint: [work-result.md 경로] [사용자 의도]
---

# Patch 사후 연결

현재 세션에서 이미 수행한 변경을 기존 Sugo 계보에 연결합니다.

1. 경로가 없으면 현재 등록 프로젝트의 완료 결과만 찾아 후보를 보여줍니다. 후보가 여러 개면 사용자가 고르게 하며 추측하지 않습니다.
2. 현재 대화, Git 상태, diff와 이력을 읽습니다. 변경 파일 전체와 이번 대화에 포함할 파일을 구분해 보여줍니다. 관련 없는 파일이나 불확실한 파일이 있으면 정확한 포함 목록을 확인받습니다.
3. `sugo_plan(action:"start", projectPath, featureName, workResultPath, seed, patchProvenance:"captured-post-hoc", postHocChangedFiles:[확정한 저장소 상대경로], postHocBaseRevision?)`를 호출합니다. 커밋 전 변경은 서버가 HEAD를 기준선으로 기록합니다. 이미 커밋한 변경은 확인한 변경 전 revision을 전달합니다. 이후 일반 `/sugo:patch`와 같은 전체 파이프라인과 게이트를 실행합니다.
4. 서버가 산출물에 `captured-post-hoc` 출처와 Git 기준선을 기록합니다. 관찰하지 못한 과거 증거는 만들지 않습니다.
5. 기준선, 파일 범위, 기존 계보를 확정할 수 없거나 같은 변경을 이미 연결했다면 중단하고 해결 방법을 안내합니다.
