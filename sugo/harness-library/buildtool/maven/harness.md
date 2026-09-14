# Maven 하네스 (buildtool/maven)

## 핵심 규칙

1. **`mvnw`/`mvnw.cmd` 래퍼를 커밋한다.** 없으면 로컬 Maven 버전 차이로 빌드가 사람마다 달라진다.
2. **테스트 스킵 플래그(`-DskipTests`, `maven.test.skip`)를 커밋된 빌드 설정에 넣지 않는다.** 넣으면 CI가 실제로는 테스트를 한 줄도 안 돌리고도 그린으로 보고한다 — 가장 위험한 종류의 거짓 성공이다.
