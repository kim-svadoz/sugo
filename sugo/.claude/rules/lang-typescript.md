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
  - "**/tsconfig.json"
  - "**/yarn.lock"
---

# TypeScript 하네스 (lang/typescript)

## 핵심 규칙

1. **타입 에러를 회피하기 위해 타입을 조작하지 않는다.** `any`/`as any`/널 단언(`!`)으로 컴파일러를 조용히 시키는 것과, 실제 타입 문제를 고치는 것은 다르다. 진짜 원인을 고치거나 `unknown` + 타입가드로 좁힌다. 불가피하면 그 자리에 이유를 남긴다.
2. **타입 에러를 회피하려고 `tsconfig.json`의 strict 계열 설정을 낮추지 않는다.** 에러가 사라지는 것과 문제가 해결되는 것은 다르다.
3. **비동기 함수의 예외를 삼키지 않는다.** `.catch` 누락이나 미처리 rejection은 실패를 조용히 삼킨다.
