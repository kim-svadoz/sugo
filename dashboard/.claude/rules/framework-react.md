---
paths:
  - "**/*.cjs"
  - "**/*.cts"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.mts"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/next.config.*"
  - "**/package-lock.json"
  - "**/package.json"
  - "**/pnpm-lock.yaml"
  - "**/pnpm-workspace.yaml"
  - "**/yarn.lock"
---

# React 하네스 (framework/react)

## 핵심 규칙

1. **렌더 중에 부수효과를 넣지 않는다.** 상태 변경, 구독, 외부 값 mutate는 `useEffect`나 이벤트 핸들러 안에서만 — 렌더 함수 본문에서 하면 무한 렌더 루프나 "Cannot update a component while rendering" 경고로 이어진다.
2. **`useEffect` 의존성 배열을 실제 사용값과 정확히 맞춘다.** 누락은 stale한 값을 계속 참조하게 만들고, 과잉은 불필요한 재실행이나 무한 루프로 이어진다.
3. **변경 가능한 리스트의 key로 배열 index를 쓰지 않는다.** 항목이 추가/삭제/재정렬되면 React가 엉뚱한 항목에 이전 상태(입력값·포커스 등)를 붙인다.
