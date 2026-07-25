# npm 하네스 (buildtool/npm)

## 핵심 규칙

1. **`package-lock.json`을 커밋한다.** 재현 가능한 빌드를 위해 항상 함께 커밋.
2. **의존성 추가 시 정확한 스코프로.** 런타임에 필요하면 `dependencies`, 개발/빌드 도구면 `devDependencies`.
3. **`npm ci`를 CI/배포에서 사용.** `npm install`은 로컬 개발용, CI는 lockfile 그대로 재현하는 `npm ci`.
4. **스크립트는 `package.json`의 `scripts`에 표준화.** build/test/format/lint 이름을 통일해서 도구가 예측 가능하게.
5. **불필요한 전역 설치 지양.** 프로젝트 의존성은 로컬 `node_modules`에.

## 체크리스트

- [ ] `package-lock.json`이 변경분과 함께 커밋되었는지 확인
- [ ] 새 의존성이 올바른 스코프(dependencies/devDependencies)에 있는지 확인
