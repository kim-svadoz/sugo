# Spring Boot 3.x 하네스 (framework/spring/3.x)

`framework/spring` 공통 규칙에 더해, 3.x(Jakarta EE 9+, Java 17 베이스라인) 기준이다.

## 핵심 규칙

1. **모든 EE 임포트는 `jakarta.*`다.** `javax.persistence`, `javax.validation`, `javax.servlet`이 한 줄이라도 남아 있으면 그 자리에서 컴파일 또는 런타임 주입이 깨진다. 2.x 예제를 가져올 때 가장 먼저 확인할 지점이다.
2. **보안 설정은 람다 DSL + `SecurityFilterChain` 빈으로 한다.** `WebSecurityConfigurerAdapter`는 제거됐다 — 상속 기반 예제는 3.x에서 아예 존재하지 않는 클래스를 참조한다.
3. **새 HTTP 호출은 `RestClient`(3.2+) 또는 `WebClient`를 쓴다.** `RestTemplate`은 유지보수 모드다.
4. **관측(observability)은 Micrometer 기반 `@Observed`/`ObservationRegistry`로 통일한다.** Sleuth는 3.x로 넘어오지 않았다 — 트레이싱 코드가 조용히 no-op이 되는 걸 못 알아채는 게 이 계열의 전형적 사고다.
5. **네이티브 이미지(GraalVM)를 쓴다면 리플렉션·프록시 사용 지점에 힌트를 명시한다.** JVM에서는 통과한 리플렉션이 네이티브 빌드에서만 런타임에 터진다 — 테스트가 JVM에서만 돌면 절대 안 잡힌다.
