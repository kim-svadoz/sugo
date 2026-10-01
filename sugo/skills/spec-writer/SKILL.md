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
- 스펙은 기획자 수준으로 쓴다. 코드 에이전트는 스펙을 의심 없이 지시로 따르므로, 스펙에 섞인 구현 세부나 추정이 틀리면 그대로 개발된다.
- 하나의 기능만 다룬다. 필수 섹션: 배경/목적, 범위(In/Out), 요구사항(사용자·화면 관점 동작), 완료조건(관찰 가능한 결과), 제약(사용자가 정한 것만), Open Questions, Sources.
- "영향 지점"과 "테스트" 섹션은 쓰지 않는 것이 기본이다. 구현 방법과 테스트 설계는 code-agent와 test-agent가 코드를 읽고 정한다.

### 스펙에 넣지 않는 것

- 파일 경로, 줄 번호, 커밋 해시, 클래스·메서드 단위의 구현 방법
- 현재 코드 동작에 대한 서술
- 에이전트가 코드·데이터·문서를 조사해서 얻은 추정

코드나 온톨로지를 조사했다면 그 결과는 대화에서 판단 근거(질문할 거리, 범위 판단)로만 쓴다.

### 사실의 출처

- 스펙의 사실은 사용자가 준 것(요구, 기획 화면·문서, 결정)만 쓴다.
- 사용자가 확정하지 않은 것은 요구사항·완료조건·제약으로 쓰지 않고 Open Questions에 둔다.
- 식별자는 사용자가 이미 쓴 업무 수준 이름(모듈 코드, 화면 영역 이름 등 기획에서 쓰는 이름)까지만 쓴다. 조사로 알게 된 새 식별자는 넣지 않는다.
- 근거 없는 API, 식별자, 수치, 일정, 소유자, 동작을 만들지 않는다.
- 기존 버전은 덮어쓰지 않는다.

## 파일 규칙과 완료

- 루트: `/Users/demo-user/dev/spec`
- 경로: `/Users/demo-user/dev/spec/YYYYMMDD/<feature-slug>/vN/spec.md` (Asia/Seoul 날짜, 다음 빈 vN)
- UTF-8 Markdown으로 저장한다.
- 저장 후 파일을 다시 읽어 필수 섹션, 완료조건, "넣지 않는 것"이 섞였는지 점검한다.
- 마지막으로 `sugo_spec_writer(action:"complete", workspace, projectPath, specDraftId, specPath)`를 호출한다.
- `SPEC_LINT_WARNINGS`가 오면 연결되지 않은 상태다. 경고 줄을 고친 새 버전(vN+1)을 쓰고 다시 complete한다.
  경고를 남긴 채 연결하려면 경고 목록을 사용자에게 보여주고 명시적 승인을 받은 뒤에만 `acceptLintWarnings:true`로 재호출한다.
- 이 검사는 구현 경로(`src/main/`, `src/test/`), `파일.확장자:줄`, 줄 번호 표기, 커밋 해시처럼 보이는 문구만 본다.
  현재 코드 동작 서술이나 조사로 얻은 추정이 일반 문장으로 쓰이면 통과하므로, 경고가 없다는 것이 스펙이 기획자 수준이라는 뜻은 아니다.
- 성공하면 절대 경로와 “Schedule에서 feat 명령 복사”라는 다음 동작만 간결하게 안내한다.
