# Spring Boot 하네스 (framework/spring)

## 핵심 규칙

1. **생성자 주입만 사용.** `@Autowired` 필드 주입 금지 — 불변성과 테스트 용이성을 위해 생성자 주입.
2. **컨트롤러는 얇게.** 비즈니스 로직은 서비스 계층에, 컨트롤러는 요청/응답 변환만.
3. **트랜잭션 경계는 서비스 계층에서 명시.** `@Transactional`을 컨트롤러에 걸지 않는다.
4. **DTO와 엔티티를 분리.** 엔티티를 API 응답으로 그대로 노출하지 않는다.
5. **예외는 `@ControllerAdvice`로 중앙집중 처리.** 컨트롤러마다 try/catch를 반복하지 않는다.
6. **설정은 `application.yml` + `@ConfigurationProperties`로.** 매직 문자열로 `@Value` 남발 금지.
7. **배선(wiring) 변경은 컨텍스트 로드 테스트로 검증.** `@SpringBootTest`로 실제 빈 등록을 확인
   (mock 없이) — 이건 sugo 코어 게이트(§4.1 boot-gate)와도 직결되는 규칙.

## 체크리스트

- [ ] 새 컴포넌트가 생성자 주입을 쓰는지 확인
- [ ] 엔티티가 컨트롤러 응답으로 직접 노출되지 않는지 확인
- [ ] 배선을 바꿨다면 `@SpringBootTest` 컨텍스트 로드 테스트가 있는지 확인
