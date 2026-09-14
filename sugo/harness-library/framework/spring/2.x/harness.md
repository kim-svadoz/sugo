# Spring Boot 2.x 하네스 (framework/spring/2.x)

`framework/spring` 공통 규칙에 더해, 2.x에 묶인 코드의 제약이다. 2.x는 OSS 지원이 끝난
계열이므로 아래는 "이 버전에서 안전하게 버티는 법"이지 권장 스택이 아니다.

## 핵심 규칙

1. **`jakarta.*` 임포트를 쓰지 않는다.** 2.x는 `javax.*` 네임스페이스다. Boot 3 예제를 그대로 가져오면 임포트가 통째로 안 맞아 컴파일이 깨진다.
2. **보안 설정에 `WebSecurityConfigurerAdapter`를 새로 상속하지 않는다.** 2.7에서 이미 폐기됐다. `SecurityFilterChain` 빈을 등록하는 방식으로 쓰면 3.x 이관 시 그 부분을 다시 안 써도 된다.
3. **새 HTTP 호출에 `RestTemplate`을 쓰지 않는다.** 유지보수 모드다. `WebClient`를 쓰면 3.x 이후까지 그대로 간다.
4. **버전 업그레이드 경로를 막는 코드를 새로 만들지 않는다.** `javax` 고착, JUnit 4 전용 테스트, Undertow 의존은 전부 3.x/4.x 이관 때 다시 써야 하는 부채다.
