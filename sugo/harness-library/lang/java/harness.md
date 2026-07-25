# Java 하네스 (lang/java)

## 핵심 규칙

1. **불변성 우선.** 필드는 가능하면 `final`, 컬렉션은 `Collections.unmodifiable*`/`List.of` 등으로 방어.
2. **`null` 반환 지양.** 컬렉션은 빈 컬렉션을, 값은 `Optional<T>`를 반환한다(파라미터 타입으로는 `Optional` 지양).
3. **체크 예외 남용 금지.** 복구 불가능한 상황은 unchecked exception으로, 호출부가 강제로 catch하게 만들지 않는다.
4. **리소스는 try-with-resources.** `Closeable`/`AutoCloseable` 자원은 반드시 자동 해제.
5. **동등성은 `equals`/`hashCode` 쌍으로.** 하나만 오버라이드하지 않는다.
6. **패키지 가시성 최소화.** `public`은 외부 계약일 때만, 내부 구현은 package-private 또는 `private`.
7. **매직 넘버/문자열 금지.** 의미 있는 상수로 추출.

## 체크리스트

- [ ] 새로 추가된 public 메서드에 Javadoc 또는 자명한 이름
- [ ] try-with-resources 미적용 자원 누수 없는지 확인
- [ ] equals/hashCode 짝 확인
