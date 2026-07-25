# Yarn 하네스 (buildtool/yarn)

## 핵심 규칙

1. **`yarn.lock`을 커밋한다.** npm의 package-lock.json과 혼용하지 않는다(한 프로젝트엔 하나의 lockfile만).
2. **CI에서는 `yarn install --frozen-lockfile`(Yarn 1) 또는 `yarn install --immutable`(Yarn Berry).**
3. **워크스페이스 사용 시 루트에서 의존성 호이스팅 규칙을 이해하고 버전 충돌을 관리.**

## 체크리스트

- [ ] `yarn.lock`이 함께 커밋되었는지 확인
- [ ] `package-lock.json`이 동시에 존재하지 않는지 확인
