# Spring Boot 4.x 하네스 (framework/spring/4.x)

`framework/spring` 공통 규칙에 더해, Spring Boot 4.0(2025-11 GA, Spring Framework 7) 기준이다.
Jakarta EE 11(Servlet 6.1), Java 17 베이스라인에 Java 25 일급 지원.

## 핵심 규칙

1. **Jackson 2(`com.fasterxml.jackson.*`) API를 쓰지 않는다.** 4.0은 Jackson 3(`tools.jackson.*`)으로 갈아탔고 Jackson 2 지원을 뺐다. 커스텀 시리얼라이저·`ObjectMapper` 직접 생성 코드가 옛 패키지를 참조하면 그 지점에서 깨진다.
2. **JUnit 4(`org.junit.Test`, `@RunWith`)로 테스트를 새로 쓰지 않는다.** 4.0은 JUnit 4 지원을 완전히 제거했다 — 빈티지 엔진 없이는 아예 수집조차 안 된다. JUnit 5(Jupiter)로 쓴다.
3. **Undertow를 서블릿 컨테이너로 지정하지 않는다.** 4.0에서 제거됐다. Tomcat 또는 Jetty를 쓴다.
4. **의존성은 쪼개진 모듈을 정확히 선언한다.** 단일 `spring-boot-autoconfigure`가 70여 개 모듈로 분할됐다 — "예전엔 딸려 오던" 자동설정이 이제 안 딸려 오므로, 빠진 모듈은 빈이 조용히 등록되지 않는 형태로 드러난다.
5. **공개 API에 버전 체계를 붙인다면 프레임워크의 API 버저닝을 쓴다.** URL에 `/v2/`를 손으로 박는 대신 `@RequestMapping`의 버전 속성/`ApiVersion` 지원을 쓴다 — 라우팅과 문서화가 한 곳에서 관리된다.
6. **널 안정성은 JSpecify 애너테이션(`@NullMarked`/`@Nullable`)으로 표기한다.** Framework 7이 JSpecify로 통일했다 — 예전 `org.springframework.lang.Nullable`은 정적 분석 도구가 더 이상 같은 수준으로 해석하지 못한다.
