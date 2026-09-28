---
name: spec-writer
description: Schedule의 SPEC 초안을 구현 가능한 spec.md로 작성하거나 feat 전 수정한다. Dashboard에서 복사한 Claude/Codex 명령으로 시작한다.
---

# Sugo SPEC Writer

Claude와 Codex가 공유하는 SPEC 작성 계약이다. 제품 코드를 구현하거나 feat 세션을 시작하지 않는다.

## 입력과 잠금 확인

1. 명령의 `--workspace`, `--project`, `--spec-draft` 값을 읽는다.
2. 먼저 `sugo_spec_writer(action:"context", workspace, projectPath, specDraftId)`를 호출한다.
3. `SPEC_NOT_EDITABLE`이면 중단한다. feat가 연결된 SPEC은 수정할 수 없으며 변경은 patch로 처리한다.
4. `sugo_get_project_context(projectPath)`로 하네스, rules, 체크포인트, TODO-SPEC을 읽는다.

## 작성

- 사용자가 이 스킬 실행을 직접 요청한 것이 작성 시작 승인이다.
- 화면·문서·요구사항·현재 코드에서 확인한 사실과 가설, 미결정을 구분한다.
- 하나의 기능만 다루고 구현자가 이 대화 없이 작업할 수 있도록 목표, 범위, 비범위, 수락 기준, 제약, 영향 지점, 테스트, Open Questions, Sources를 명시한다.
- 근거 없는 API, 식별자, 수치, 일정, 소유자, 동작을 만들지 않는다.
- 기존 버전은 덮어쓰지 않는다.

## 파일 규칙과 완료

- 루트: `/Users/demo-user/dev/spec`
- 경로: `/Users/demo-user/dev/spec/YYYYMMDD/<feature-slug>/vN/spec.md` (Asia/Seoul 날짜, 다음 빈 vN)
- UTF-8 Markdown으로 저장한다.
- 저장 후 파일을 다시 읽어 필수 섹션과 수락 기준을 점검한다.
- 마지막으로 `sugo_spec_writer(action:"complete", workspace, projectPath, specDraftId, specPath)`를 호출한다.
- 성공하면 절대 경로와 “Schedule에서 feat 명령 복사”라는 다음 동작만 간결하게 안내한다.
