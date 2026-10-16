---
description: 'Schedule SPEC 초안을 구현 가능한 spec.md로 작성하고 대시보드에 연결한다. Claude/Codex가 같은 spec-writer 계약을 사용한다.'
argument-hint: --workspace <name> --project <absolute-path> --spec-draft <id>
---

`spec-writer` 스킬을 읽고 그대로 실행한다.

입력: $ARGUMENTS

반드시 `sugo_spec_writer(action:"context")`로 편집 가능 여부와 정확한 Schedule SPEC을 먼저 확인하고,
`sugo_get_project_context`로 프로젝트 컨텍스트를 로드한다. spec.md 작성 및 검증이 끝나면
`sugo_spec_writer(action:"complete")`로 절대 경로를 같은 SPEC 카드에 연결한다. 제품 구현이나 feat 시작은 하지 않는다.
스펙은 기획자 수준으로 쓰고 파일 경로·줄 번호·현재 코드 동작·조사로 얻은 추정을 넣지 않는다. complete가 `SPEC_LINT_WARNINGS`를
돌려주면 사용자 승인 없이 `acceptLintWarnings:true`로 연결하지 않는다. context가 돌려준 기획 화면(`attachments`)은
spec 버전 디렉터리의 `images/`로 복사해 spec.md에 상대경로로 넣는다.
저장 위치는 스킬의 "파일 규칙"을 따른다(프로젝트 저장소 안이 아니다). Open Questions에는 답에 따라 구현할 동작이나
완료조건이 달라지는 것만 쓰고, 담당자·일정·협의 같은 업무 조율은 쓰지 않는다.

