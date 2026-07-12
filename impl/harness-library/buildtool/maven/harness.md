# Maven 하네스 (buildtool/maven)

## 핵심 규칙

1. **버전은 `<properties>`에서 한 번만 관리.** 여러 의존성에 흩어진 버전 문자열 금지 — BOM 또는 property 사용.
2. **Wrapper(`mvnw`)를 커밋한다.** 로컬 Maven 버전 차이로 빌드가 깨지지 않도록.
3. **`mvn test`가 CI의 최소 게이트.** 테스트 스킵 플래그(`-DskipTests`)를 커밋된 설정에 넣지 않는다.
4. **의존성 스코프를 명확히.** `test` 전용 라이브러리는 `<scope>test</scope>`.

## 체크리스트

- [ ] 새 의존성 버전이 하드코딩 대신 property/BOM을 통하는지 확인
- [ ] mvnw/mvnw.cmd가 저장소에 있는지 확인
