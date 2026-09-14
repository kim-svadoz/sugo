# Gradle 9 하네스 (buildtool/gradle/9.x)

현행 계열(9.7.x). `buildtool/gradle` + `8.x` 규칙 위에, 설정 캐시를 전제로 한 제약이다.

## 핵심 규칙

1. **설정 단계에서 환경을 직접 읽지 않는다.** 설정 단계의 `System.getenv()`·`System.getProperty()`·파일 읽기는 설정 캐시를 무효화하거나 캐시된 값을 굳혀버린다. `providers.environmentVariable(...)`/`providers.gradleProperty(...)`로 받아 **provider로 전달**한다.
2. **태스크 액션에서 `project`를 참조하지 않는다.** 실행 시점에 프로젝트 객체에 접근하면 설정 캐시가 깨진다 — 필요한 값은 태스크 입력 프로퍼티로 미리 받는다.
3. **Java 17 이상에서 실행한다.** 9는 그 이하 JVM에서 돌지 않는다. 툴체인으로 컴파일 대상(8/11)을 맞추는 것과 Gradle 자신이 도는 JVM은 별개다.
4. **`--no-configuration-cache`로 문제를 덮지 않는다.** 캐시를 끄면 실패는 사라지지만 원인은 남고, 빌드 시간도 되돌아간다.
