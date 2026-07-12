# Gradle 하네스 (buildtool/gradle)

## 핵심 규칙

1. **Wrapper(`gradlew`/`gradlew.bat`)를 커밋한다.** 로컬 Gradle 버전 차이로 빌드가 깨지지 않도록.
2. **버전 카탈로그(`libs.versions.toml`) 또는 최소한 `ext`로 버전을 중앙관리.** 여러 모듈에 버전 문자열 중복 금지.
3. **`build.gradle`에 로직을 넣지 않는다.** 복잡한 빌드 로직은 별도 플러그인/스크립트로 분리.
4. **`./gradlew test`가 CI의 최소 게이트.**
5. **멀티 모듈이면 모듈 간 의존 방향을 명확히.** 순환 의존 금지.

## 체크리스트

- [ ] gradlew/gradlew.bat이 저장소에 있는지 확인
- [ ] 새 의존성 버전이 중앙관리 지점을 통하는지 확인
