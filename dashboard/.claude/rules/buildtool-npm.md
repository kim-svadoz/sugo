---
paths:
  - "**/package-lock.json"
  - "**/package.json"
---

# npm 하네스 (buildtool/npm)

## 핵심 규칙

1. **`package-lock.json`을 변경분과 함께 커밋한다.** 없으면 다른 환경에서 다른 버전이 설치되는, 재현 안 되는 빌드가 된다.
2. **런타임에 필요한 패키지는 `dependencies`에 넣는다.** `devDependencies`에 잘못 넣으면 프로덕션 설치(`npm ci --omit=dev`) 시 그 모듈을 못 찾아 런타임에 크래시한다.
3. **CI/배포에서는 `npm install`이 아니라 `npm ci`를 쓴다.** `npm install`은 lockfile을 조용히 갱신할 수 있어, "로컬에서는 되는데 CI에서는 다른 버전이 깔린다"는 상황을 만든다.
