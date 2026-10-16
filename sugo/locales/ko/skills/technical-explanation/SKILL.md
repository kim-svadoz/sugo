---
name: technical-explanation
description: '기술 내용을 ASD-STE100 English 또는 ASD-STE100 원칙 기반 한국어로 명확하게 설명한다. "ASD-STE100으로 설명해줘", "STE로 설명", "간결한 기술 영어로 설명" 요청에 사용한다. 사실·게이트·근거는 바꾸지 않는다.'
---

# Sugo Technical Explanation

이 스킬은 판단 도구가 아니라 표현 계층이다. 원본의 상태, 근거, 식별자, 수치, 게이트 결과를
변경하거나 보충하지 않는다.

## 입력과 사실 원본

1. 사용자가 설명할 대상을 확인한다.
2. Sugo 세션이나 Task의 상태를 설명할 때는 `sugo_ontology`의 `explain_state`, `explain_block`,
   `next_actions` 중 필요한 질의를 먼저 호출한다.
3. 한국어 설명은 `presentation:"ste-inspired-ko"`, 영어 설명은
   `presentation:"asd-ste100-en"`을 지정한다.
4. 응답의 `result`만 사실 원본으로 사용한다. `presentation.rules`는 문장 작성 규칙이지 새로운
   사실이 아니다.
5. 일반 코드나 문서를 설명할 때도 실제 코드·문서를 사실 원본으로 사용한다. 확인되지 않은 원인이나
   효과를 지어내지 않는다.

## 출력 모드

사용자가 영어를 명시하면 `ASD-STE100 English`를 사용한다. 언어를 지정하지 않고 한국어로
질문하면 `STE-inspired Korean`을 사용한다.

### STE-inspired Korean

- 한 문장에는 한 주제 또는 한 행동만 쓴다.
- 짧은 능동문을 쓴다.
- 같은 개념에는 같은 용어를 쓴다.
- 현재 상태 → 원인 또는 근거 → 필요한 행동 → 행동 뒤 단계 순서로 쓴다.
- 전문 용어와 코드 식별자는 원문을 유지한다.
- 결과를 `ASD-STE100 준수`라고 부르지 않는다. `ASD-STE100 원칙 기반 한국어`라고 표시한다.

### ASD-STE100 English

- `presentation.rules`를 전부 따른다.
- 한 문장에 하나의 instruction 또는 topic만 쓴다.
- 짧은 능동문을 쓰고 같은 대상을 같은 term으로 부른다.
- condition은 관련 instruction 앞에 둔다.
- 기술 명칭, 명령, 상태, 파일 경로는 바꾸지 않는다.
- 공식 사전 및 전체 규칙 검사와 전문 검토가 없으면 `ASD-STE100 compliant`라고 단정하지 않는다.
  필요하면 `ASD-STE100 style; compliance not verified`라고 표시한다.

## 금지

- 설명을 쉽게 만들기 위해 차단 원인이나 실패를 생략하지 않는다.
- 여러 선택지를 하나의 권고로 임의 축약하지 않는다.
- `result`에 없는 다음 단계, 성공 여부, 인과관계를 추가하지 않는다.
- 한국어 출력에 영어 통제 사전 준수를 주장하지 않는다.

