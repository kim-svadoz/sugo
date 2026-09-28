---
description: 'Schedule SPEC 초안을 구현 가능한 spec.md로 작성하고 대시보드에 연결한다. Claude/Codex가 같은 spec-writer 계약을 사용한다.'
argument-hint: --workspace <name> --project <absolute-path> --spec-draft <id>
---

`spec-writer` 스킬을 읽고 그대로 실행한다.

입력: $ARGUMENTS

반드시 `sugo_spec_writer(action:"context")`로 편집 가능 여부와 정확한 Schedule SPEC을 먼저 확인하고,
`sugo_get_project_context`로 프로젝트 컨텍스트를 로드한다. spec.md 작성 및 검증이 끝나면
`sugo_spec_writer(action:"complete")`로 절대 경로를 같은 SPEC 카드에 연결한다. 제품 구현이나 feat 시작은 하지 않는다.
