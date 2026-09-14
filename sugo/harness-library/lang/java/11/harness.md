# Java 11 하네스 (lang/java/11)

`lang/java` 공통 규칙에 더해, Java 11(LTS)에서 쓸 수 있게 된 것과 여전히 못 쓰는 것의 경계다.

## 핵심 규칙

1. **지역 변수에는 `var`를 쓰되, 타입이 우변에서 안 드러나면 쓰지 않는다.** `var result = service.process()`처럼 반환 타입이 이름에서 안 보이면 읽는 사람이 타입을 추적해야 한다 — 이럴 땐 명시한다.
2. **`record`/`sealed`/`switch` 패턴 매칭은 아직 쓸 수 없다.** Java 16/17 문법이다. 불변 데이터 홀더가 필요하면 `final` 필드 + 생성자로 직접 만든다.
3. **HTTP 호출에 새로 `HttpURLConnection`을 쓰지 않는다.** Java 11부터 표준 `java.net.http.HttpClient`가 있다 — 타임아웃 설정이 명시적이고 비동기도 된다.
4. **`Collections.unmodifiable*` 대신 `List.of`/`Map.of`를 쓴다.** 복사가 아니라 뷰를 반환하는 `unmodifiable*`은 원본이 바뀌면 같이 바뀐다 — 불변인 줄 알았던 값이 바뀌는 사고로 이어진다.
