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

# TypeScript 5.x 하네스 (lang/typescript/5.x)

`lang/typescript` 공통 규칙에 더해, 5.x 계열(JS 기반 `tsc`)에서 지켜야 할 것과, 6/7로 넘어갈 때
발목을 잡는 것들이다.

## 핵심 규칙

1. **`enum`과 네임스페이스(`namespace`)를 새로 쓰지 않는다.** 6.0에서 폐기 경고 대상이 되고 7.0의 Go 네이티브 컴파일러 전환에서 가장 먼저 문제가 되는 구문이다. 상수 집합은 union literal 타입으로, 모듈 구분은 파일/디렉터리로 한다.
2. **`tsc` 동작에 의존하는 커스텀 트랜스폼을 만들지 않는다.** 컴파일러 API(`ts.transform`, 커스텀 트랜스포머)에 붙은 코드는 7.0에서 그대로 동작하지 않는다 — 빌드 파이프라인 전체가 이관 비용이 된다.
3. **`moduleResolution`은 `bundler` 또는 `node16`/`nodenext`로 명시한다.** 구식 `node`(=node10) 해석은 `exports` 필드를 무시해서, 패키지가 의도한 진입점이 아닌 파일을 가져온다.
4. **`verbatimModuleSyntax`를 켜고 타입 전용 임포트는 `import type`으로 쓴다.** 런타임 임포트와 타입 임포트가 섞이면 번들에 불필요한 모듈이 남거나, 반대로 사이드이펙트가 필요한 임포트가 제거된다.
