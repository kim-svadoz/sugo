# Sugo 설계 불변식 (문서로 지키는 항목)

게이트나 테스트로 기계 검사하지 않고 설계 원칙으로 지키는 불변식이다. 나머지 불변식의 구현 근거는
`sugo/src/ontology/model.ts`의 `INVARIANTS`가 게이트·테스트 경로로 직접 가리킨다.

| id | 내용 |
|---|---|
| `async-asymmetry` | 플러그인→대시보드 push(fire-and-forget), pull은 플러그인이. 대시보드는 플러그인을 못 부른다 |
| `user-truth` | 사용자가 보는 상태 = 실제 상태. 괴리는 곧 버그 |
